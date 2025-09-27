const { validateTwilioSignature, downloadAudio } = require('./utils');
const eviService = require('../services/evi');

exports.handler = async (event) => {
  console.log('Received Twilio webhook:', JSON.stringify(event, null, 2));

  try {
    // Validate Twilio signature for security
    const isValid = validateTwilioSignature(event);
    if (!isValid) {
      console.error('Invalid Twilio signature');
      return {
        statusCode: 403,
        body: JSON.stringify({ error: 'Forbidden' })
      };
    }

    // Parse the webhook payload
    const body = parseUrlEncoded(event.body);
    console.log('Parsed webhook body:', body);

    // Check if this is a recording completion webhook
    if (body.StatusCallbackEvent === 'recording-completed') {
      return await handleRecordingCompleted(body);
    }

    // Handle other webhook types (call status, etc.)
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/xml' },
      body: '<?xml version="1.0" encoding="UTF-8"?><Response></Response>'
    };

  } catch (error) {
    console.error('Error processing webhook:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Internal server error',
        message: error.message
      })
    };
  }
};

async function handleRecordingCompleted(body) {
  try {
    const recordingUrl = body.RecordingUrl;
    const callSid = body.CallSid;
    const fromNumber = body.From;
    const toNumber = body.To;

    console.log(`Processing recording for call ${callSid}: ${recordingUrl}`);

    // Step 1: Download the audio file from Twilio
    const audioBuffer = await downloadAudio(recordingUrl + '.mp3');
    console.log(`Downloaded audio file: ${audioBuffer.length} bytes`);

    // Step 2: Process with Hume EVI (handles transcription, understanding, and response generation)
    const eviResponse = await eviService.processAudioMessage(audioBuffer, {
      callSid,
      fromNumber,
      toNumber,
      sessionContext: `Caller from ${fromNumber} to ${toNumber}`
    });

    console.log('EVI processing completed:', {
      transcription: eviResponse.transcription,
      responseText: eviResponse.responseText,
      hasAudio: !!eviResponse.responseAudio
    });

    // Step 3: Return comprehensive response
    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        callSid,
        transcription: eviResponse.transcription,
        responseText: eviResponse.responseText,
        emotionalAnalysis: eviResponse.emotionalAnalysis,
        responseAudioSize: eviResponse.responseAudio ? eviResponse.responseAudio.length : 0,
        processingTimeMs: eviResponse.processingTimeMs
      })
    };

  } catch (error) {
    console.error('Error processing recording:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Failed to process recording',
        message: error.message,
        callSid: body.CallSid
      })
    };
  }
}

function parseUrlEncoded(body) {
  const params = new URLSearchParams(body);
  const result = {};
  for (const [key, value] of params) {
    result[key] = value;
  }
  return result;
}