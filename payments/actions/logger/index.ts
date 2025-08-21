export interface LogPayload {
    [key: string]: any;
  }
  
  class Logger {
    info(message: string, payload?: LogPayload) {
      console.log(`ℹ️ ${message}`, payload || '');
    }
  
    warn(message: string, payload?: LogPayload) {
      console.warn(`⚠️ ${message}`, payload || '');
    }
  
    error(message: string, payload?: LogPayload) {
      console.error(`❌ ${message}`, payload || '');
    }
  }
  
  export const logger = new Logger();