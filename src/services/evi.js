const WebSocket = require('ws');
const { Buffer } = require('buffer');

class HumeEVIService {
  constructor() {
    this.apiKey = process.env.HUME_API_KEY;
    this.secretKey = process.env.HUME_SECRET_KEY;
    this.baseUrl = 'wss://api.hume.ai/v0/evi/chat';

    if (!this.apiKey) {
      throw new Error('HUME_API_KEY environment variable is required');
    }
  }

  async processAudioMessage(audioBuffer, options = {}) {
    const startTime = Date.now();

    try {
      console.log('Starting EVI processing for audio message...');

      // Create WebSocket connection to Hume EVI
      const ws = await this.connectToEVI(options);

      // Process the audio through EVI and get response
      const result = await this.sendAudioAndGetResponse(ws, audioBuffer, options);

      const processingTime = Date.now() - startTime;

      return {
        ...result,
        processingTimeMs: processingTime
      };

    } catch (error) {
      console.error('EVI processing failed:', error);
      throw new Error(`EVI processing failed: ${error.message}`);
    }
  }

  async connectToEVI(options = {}) {
    return new Promise((resolve, reject) => {
      try {
        // Build WebSocket URL with authentication and options
        const url = this.buildWebSocketURL(options);
        console.log('Connecting to EVI WebSocket...');

        const ws = new WebSocket(url);

        ws.on('open', () => {
          console.log('EVI WebSocket connection established');
          resolve(ws);
        });

        ws.on('error', (error) => {
          console.error('EVI WebSocket connection error:', error);
          reject(new Error(`WebSocket connection failed: ${error.message}`));
        });

        // Set connection timeout
        setTimeout(() => {
          if (ws.readyState === WebSocket.CONNECTING) {
            ws.terminate();
            reject(new Error('WebSocket connection timeout'));
          }
        }, 10000); // 10 second timeout

      } catch (error) {
        reject(error);
      }
    });
  }

  buildWebSocketURL(options = {}) {
    const params = new URLSearchParams();

    // Authentication
    params.append('api_key', this.apiKey);

    // Optional configuration parameters
    if (options.configId) {
      params.append('config_id', options.configId);
    }

    if (options.chatGroupId) {
      params.append('chat_group_id', options.chatGroupId);
    }

    // Enable verbose transcription for better debugging
    params.append('verbose_transcription', 'true');

    return `${this.baseUrl}?${params.toString()}`;
  }

  async sendAudioAndGetResponse(ws, audioBuffer, options = {}) {
    return new Promise((resolve, reject) => {
      let transcription = '';
      let responseText = '';
      let responseAudio = null;
      let emotionalAnalysis = {};
      let isComplete = false;

      // Set response timeout
      const timeout = setTimeout(() => {
        if (!isComplete) {
          ws.terminate();
          reject(new Error('EVI response timeout'));
        }
      }, 30000); // 30 second timeout

      // Handle incoming messages
      ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          console.log('EVI message type:', message.type);

          switch (message.type) {
            case 'user_message':
              // User's transcribed message with emotional analysis
              if (message.message && message.message.content) {
                transcription = message.message.content;
                console.log('Transcription received:', transcription);
              }
              if (message.models && message.models.prosody) {
                emotionalAnalysis = message.models.prosody.scores || {};
                console.log('Emotional analysis:', emotionalAnalysis);
              }
              break;

            case 'assistant_message':
              // EVI's text response
              if (message.message && message.message.content) {
                responseText = message.message.content;
                console.log('Assistant response:', responseText);
              }
              break;

            case 'audio_output':
              // EVI's audio response
              if (message.data) {
                responseAudio = Buffer.from(message.data, 'base64');
                console.log('Audio response received:', responseAudio.length, 'bytes');
              }
              break;

            case 'assistant_end':
              // End of EVI's response
              console.log('EVI response completed');
              clearTimeout(timeout);
              isComplete = true;
              ws.close();

              resolve({
                transcription,
                responseText,
                responseAudio,
                emotionalAnalysis
              });
              break;

            case 'error':
              console.error('EVI error:', message);
              clearTimeout(timeout);
              ws.close();
              reject(new Error(`EVI error: ${message.message || 'Unknown error'}`));
              break;

            default:
              console.log('Unknown EVI message type:', message.type);
          }

        } catch (parseError) {
          console.error('Error parsing EVI message:', parseError);
        }
      });

      ws.on('error', (error) => {
        clearTimeout(timeout);
        reject(new Error(`WebSocket error: ${error.message}`));
      });

      ws.on('close', () => {
        clearTimeout(timeout);
        if (!isComplete) {
          reject(new Error('WebSocket closed before response was complete'));
        }
      });

      // Send the audio data
      this.sendAudioInput(ws, audioBuffer);
    });
  }

  sendAudioInput(ws, audioBuffer) {
    try {
      console.log('Sending audio input to EVI...');

      // Convert audio buffer to base64 for transmission
      const base64Audio = audioBuffer.toString('base64');

      // Send audio_input message
      const audioMessage = {
        type: 'audio_input',
        data: base64Audio
      };

      ws.send(JSON.stringify(audioMessage));
      console.log('Audio input sent to EVI');

    } catch (error) {
      console.error('Error sending audio to EVI:', error);
      throw error;
    }
  }

  // Method for streaming conversations (for future use)
  async startStreamingSession(options = {}) {
    try {
      const ws = await this.connectToEVI(options);

      return {
        ws,
        sendAudio: (audioBuffer) => this.sendAudioInput(ws, audioBuffer),
        sendText: (text) => this.sendTextInput(ws, text),
        close: () => ws.close()
      };

    } catch (error) {
      console.error('Failed to start streaming session:', error);
      throw error;
    }
  }

  sendTextInput(ws, text) {
    try {
      const textMessage = {
        type: 'user_input',
        text: text
      };

      ws.send(JSON.stringify(textMessage));
      console.log('Text input sent to EVI:', text);

    } catch (error) {
      console.error('Error sending text to EVI:', error);
      throw error;
    }
  }

  // Helper method to get access token (if needed for client-side usage)
  async getAccessToken() {
    try {
      const response = await fetch('https://api.hume.ai/oauth2-cc/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: this.apiKey,
          client_secret: this.secretKey
        })
      });

      if (!response.ok) {
        throw new Error(`Token request failed: ${response.status}`);
      }

      const tokenData = await response.json();
      return tokenData.access_token;

    } catch (error) {
      console.error('Failed to get access token:', error);
      throw error;
    }
  }
}

module.exports = new HumeEVIService();