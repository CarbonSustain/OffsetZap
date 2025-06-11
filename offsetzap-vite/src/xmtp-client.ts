/**
 * XMTP Client Wrapper for OffsetZap Frontend
 * 
 * This provides a clean API for the frontend to interact with the XMTP backend service
 * without dealing with WASM storage conflicts or browser compatibility issues.
 */

// Default API URL - should match where your xmtp-service.js is running
const DEFAULT_API_URL = 'http://localhost:3001';

/**
 * Configuration options for the XMTP client
 */
interface XmtpClientConfig {
  apiUrl?: string;
}

/**
 * Response from the XMTP service API
 */
interface XmtpResponse {
  success: boolean;
  error?: string;
  recipient?: string;
  timestamp?: string;
}

/**
 * Retirement notification parameters
 */
interface RetirementNotificationParams {
  recipientAddress: string;
  requestId: string | number;
  amount: string | number;
  tokenSymbol?: string;
  status: 'initiated' | 'completed' | 'failed';
  transactionHash?: string;
}

/**
 * Client wrapper for the XMTP messaging service
 */
export class XmtpClient {
  private apiUrl: string;
  
  /**
   * Create a new XMTP client instance
   */
  constructor(config?: XmtpClientConfig) {
    this.apiUrl = config?.apiUrl || DEFAULT_API_URL;
  }
  
  /**
   * Check if the service is healthy
   */
  async checkHealth(): Promise<boolean> {
    try {
      const response = await fetch(`${this.apiUrl}/health`);
      const data = await response.json();
      return data.status === 'ok';
    } catch (error) {
      console.error('XMTP service health check failed:', error);
      return false;
    }
  }
  
  /**
   * Send a direct message to a recipient
   */
  async sendMessage(recipientAddress: string, message: string): Promise<XmtpResponse> {
    try {
      const response = await fetch(`${this.apiUrl}/api/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ recipientAddress, message }),
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        console.error('Failed to send XMTP message:', data.error);
      }
      
      return data;
    } catch (error) {
      console.error('Error sending XMTP message:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
  
  /**
   * Send a carbon retirement notification
   */
  async sendRetirementNotification(params: RetirementNotificationParams): Promise<XmtpResponse> {
    try {
      const response = await fetch(`${this.apiUrl}/api/notify/retirement`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(params),
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        console.error('Failed to send retirement notification:', data.error);
      }
      
      return data;
    } catch (error) {
      console.error('Error sending retirement notification:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
