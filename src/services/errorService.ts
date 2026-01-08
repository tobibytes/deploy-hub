interface ErrorLogEntry {
  timestamp: string;
  level: 'error' | 'warning' | 'info';
  message: string;
  context?: Record<string, any>;
  stack?: string;
  url?: string;
  userAgent?: string;
}

class ErrorService {
  private maxLogs = 100;

  logError(message: string, error?: Error, context?: Record<string, any>) {
    const errorLog: ErrorLogEntry = {
      timestamp: new Date().toISOString(),
      level: 'error',
      message,
      context,
      stack: error?.stack,
      url: window.location.href,
      userAgent: navigator.userAgent,
    };

    this.saveLog(errorLog);
    console.error('[ErrorService]', message, error, context);
  }

  logWarning(message: string, context?: Record<string, any>) {
    const errorLog: ErrorLogEntry = {
      timestamp: new Date().toISOString(),
      level: 'warning',
      message,
      context,
      url: window.location.href,
      userAgent: navigator.userAgent,
    };

    this.saveLog(errorLog);
    console.warn('[ErrorService]', message, context);
  }

  logInfo(message: string, context?: Record<string, any>) {
    const errorLog: ErrorLogEntry = {
      timestamp: new Date().toISOString(),
      level: 'info',
      message,
      context,
      url: window.location.href,
      userAgent: navigator.userAgent,
    };

    this.saveLog(errorLog);
    console.info('[ErrorService]', message, context);
  }

  private saveLog(log: ErrorLogEntry) {
    try {
      const existingLogs = this.getLogs();
      existingLogs.unshift(log);

      // Keep only the most recent logs
      if (existingLogs.length > this.maxLogs) {
        existingLogs.splice(this.maxLogs);
      }

      localStorage.setItem('errorLogs', JSON.stringify(existingLogs));
    } catch (e) {
      console.error('Failed to save error log:', e);
    }
  }

  getLogs(level?: 'error' | 'warning' | 'info'): ErrorLogEntry[] {
    try {
      const logs = JSON.parse(localStorage.getItem('errorLogs') || '[]');
      if (level) {
        return logs.filter((log: ErrorLogEntry) => log.level === level);
      }
      return logs;
    } catch (e) {
      console.error('Failed to retrieve error logs:', e);
      return [];
    }
  }

  clearLogs() {
    try {
      localStorage.removeItem('errorLogs');
    } catch (e) {
      console.error('Failed to clear error logs:', e);
    }
  }

  getStats() {
    const logs = this.getLogs();
    const errors = logs.filter(log => log.level === 'error').length;
    const warnings = logs.filter(log => log.level === 'warning').length;
    const info = logs.filter(log => log.level === 'info').length;

    return {
      total: logs.length,
      errors,
      warnings,
      info,
    };
  }
}

export const errorService = new ErrorService();

// Global error handler for unhandled errors
window.addEventListener('error', (event) => {
  errorService.logError(
    'Unhandled error',
    event.error,
    {
      message: event.message,
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
    }
  );
});

// Global handler for unhandled promise rejections
window.addEventListener('unhandledrejection', (event) => {
  errorService.logError(
    'Unhandled promise rejection',
    event.reason instanceof Error ? event.reason : new Error(String(event.reason)),
    {
      reason: event.reason,
    }
  );
});
