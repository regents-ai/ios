// Extend Express Request type to include custom properties for authentication
declare namespace Express {
  export interface Request {
    userId?: string;
    userData?: {
      id: string;
      sessionId?: string;
      testAccount?: boolean;
      [key: string]: any;
    };
  }
}
