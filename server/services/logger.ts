interface ErrorLog {
  timestamp: string;
  level: 'error' | 'warn' | 'info';
  message: string;
  context?: Record<string, any>;
  stack?: string;
}

class ErrorLogger {
  private logs: ErrorLog[] = [];
  private maxLogs: number = 1000;

  log(level: 'error' | 'warn' | 'info', message: string, context?: Record<string, any>, stack?: string) {
    const logEntry: ErrorLog = {
      timestamp: new Date().toISOString(),
      level,
      message,
      context,
      stack,
    };

    this.logs.unshift(logEntry);

    // Keep only the most recent logs
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(0, this.maxLogs);
    }

    // Console output with appropriate method
    const consoleMethod = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
    consoleMethod(`[${logEntry.timestamp}] [${level.toUpperCase()}] ${message}`, context || '');
  }

  error(message: string, context?: Record<string, any>, stack?: string) {
    this.log('error', message, context, stack);
  }

  warn(message: string, context?: Record<string, any>) {
    this.log('warn', message, context);
  }

  info(message: string, context?: Record<string, any>) {
    this.log('info', message, context);
  }

  getLogs(limit?: number, level?: 'error' | 'warn' | 'info'): ErrorLog[] {
    let filteredLogs = this.logs;

    if (level) {
      filteredLogs = filteredLogs.filter(log => log.level === level);
    }

    return limit ? filteredLogs.slice(0, limit) : filteredLogs;
  }

  clearLogs() {
    this.logs = [];
  }

  getStats() {
    const errorCount = this.logs.filter(log => log.level === 'error').length;
    const warnCount = this.logs.filter(log => log.level === 'warn').length;
    const infoCount = this.logs.filter(log => log.level === 'info').length;

    return {
      total: this.logs.length,
      errors: errorCount,
      warnings: warnCount,
      info: infoCount,
    };
  }
}

export const logger = new ErrorLogger();
