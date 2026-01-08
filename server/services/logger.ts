interface ErrorLog {
  timestamp: string;
  level: 'error' | 'warn' | 'info';
  message: string;
  context?: Record<string, any>;
  stack?: string;
  userId?: string;
}

class ErrorLogger {
  private logs: ErrorLog[] = [];
  private maxLogs: number = 1000;

  log(level: 'error' | 'warn' | 'info', message: string, context?: Record<string, any>, stack?: string, userId?: string) {
    const logEntry: ErrorLog = {
      timestamp: new Date().toISOString(),
      level,
      message,
      context,
      stack,
      userId,
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

  error(message: string, context?: Record<string, any>, stack?: string, userId?: string) {
    this.log('error', message, context, stack, userId);
  }

  warn(message: string, context?: Record<string, any>, userId?: string) {
    this.log('warn', message, context, undefined, userId);
  }

  info(message: string, context?: Record<string, any>, userId?: string) {
    this.log('info', message, context, undefined, userId);
  }

  getLogs(limit?: number, level?: 'error' | 'warn' | 'info', userId?: string): ErrorLog[] {
    let filteredLogs = this.logs;

    if (userId) {
      filteredLogs = filteredLogs.filter(log => log.userId === userId);
    }

    if (level) {
      filteredLogs = filteredLogs.filter(log => log.level === level);
    }

    return limit ? filteredLogs.slice(0, limit) : filteredLogs;
  }

  clearLogs() {
    this.logs = [];
  }

  getStats(userId?: string) {
    let filteredLogs = this.logs;
    
    if (userId) {
      filteredLogs = filteredLogs.filter(log => log.userId === userId);
    }

    const errorCount = filteredLogs.filter(log => log.level === 'error').length;
    const warnCount = filteredLogs.filter(log => log.level === 'warn').length;
    const infoCount = filteredLogs.filter(log => log.level === 'info').length;

    return {
      total: filteredLogs.length,
      errors: errorCount,
      warnings: warnCount,
      info: infoCount,
    };
  }
}

export const logger = new ErrorLogger();
