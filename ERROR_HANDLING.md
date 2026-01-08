# Error Handling and Monitoring System

This document describes the comprehensive error handling and monitoring system implemented in the Deploy Hub application.

## Overview

The application now includes extensive error handling for both frontend and backend, along with a dedicated monitoring page to track and analyze errors.

## Backend Error Handling

### 1. Error Handler Middleware (`server/middleware/errorHandler.ts`)

- **AppError Class**: Custom error class for operational errors with status codes
- **Global Error Handler**: Catches all errors and sends formatted responses
- **asyncHandler**: Wrapper function to handle async route errors
- **notFoundHandler**: Handles 404 errors for undefined routes

### 2. Validation Middleware (`server/middleware/validation.ts`)

- Validates container deployment requests
- Validates container IDs
- Checks for required fields and proper formats
- Returns 400 errors for invalid input

### 3. Error Logger Service (`server/services/logger.ts`)

- Logs all errors, warnings, and info messages
- Stores logs in memory (up to 1000 entries)
- Provides methods to retrieve and filter logs
- Returns statistics on log levels

### 4. API Endpoints

All API endpoints now include:
- Comprehensive try-catch blocks
- Specific error messages for different scenarios
- Proper HTTP status codes
- Error logging for debugging

### 5. Monitoring Endpoints

- `GET /api/monitoring/logs?limit=100&level=error` - Get error logs
- `GET /api/monitoring/stats` - Get error statistics
- `DELETE /api/monitoring/logs` - Clear logs

## Frontend Error Handling

### 1. Error Boundary (`src/components/ErrorBoundary.tsx`)

- Catches React component errors
- Displays user-friendly error messages
- Logs errors to localStorage
- Provides recovery options (Try Again, Go Home, Reload)

### 2. Error Service (`src/services/errorService.ts`)

- Centralized error logging system
- Stores errors in localStorage (up to 100 entries)
- Captures unhandled errors and promise rejections
- Provides methods to retrieve and analyze errors
- Logs error context including URL, user agent, and stack traces

### 3. Enhanced Backend API Client (`src/lib/backend-api.ts`)

- Unified error handling for all API calls
- Better error messages
- Network error detection
- Automatic retry logic via React Query

### 4. Component-Level Error Handling

All components now include:
- Try-catch blocks for async operations
- Error logging via errorService
- User-friendly error messages via toast notifications
- Proper null/undefined checks

## Monitoring Page

Access the monitoring page at `/dashboard/monitoring`

### Features:

1. **Dual View**: Separate tabs for frontend and backend logs
2. **Statistics Dashboard**: Shows total logs, errors, warnings, and info
3. **Filtering**: 
   - Filter by log level (error, warning, info)
   - Search by message or context
4. **Log Details**:
   - Timestamp
   - Level badge
   - Error message
   - Expandable context
   - Stack traces for errors
5. **Actions**:
   - Refresh logs
   - Export logs to JSON
   - Clear logs

## Error Types and Handling

### Backend Errors

1. **Validation Errors (400)**
   - Missing required fields
   - Invalid data format
   - Invalid container names

2. **Not Found Errors (404)**
   - Container not found
   - Resource not found

3. **Conflict Errors (409)**
   - Duplicate container names

4. **Server Errors (500)**
   - Docker connection issues
   - Database errors
   - Unexpected errors

### Frontend Errors

1. **React Component Errors**
   - Caught by ErrorBoundary
   - User can retry or navigate away

2. **API Call Errors**
   - Network errors
   - HTTP errors
   - Timeout errors

3. **Unhandled Errors**
   - Global error handler
   - Promise rejection handler

## Best Practices

### When Adding New Features:

1. **Backend Routes**:
   ```typescript
   app.post('/api/endpoint', validateMiddleware, asyncHandler(async (req, res) => {
     try {
       // Your logic here
       logger.info('Operation successful', { context });
       res.json(result);
     } catch (error: any) {
       logger.error('Operation failed', { error: error.message });
       throw new AppError('User-friendly message', 500);
     }
   }));
   ```

2. **Frontend Components**:
   ```typescript
   const fetchData = async () => {
     try {
       const result = await apiCall();
       // Handle success
     } catch (error: any) {
       errorService.logError('Operation failed', error, { context });
       toast.error(error.message || 'Operation failed');
     }
   };
   ```

3. **Always use the error service for logging**:
   - `errorService.logError()` for errors
   - `errorService.logWarning()` for warnings
   - `errorService.logInfo()` for info messages

## Testing Error Handling

### Backend:
```bash
# Test validation error
curl -X POST http://localhost:3001/api/containers \
  -H "Content-Type: application/json" \
  -d '{}'

# Test 404 error
curl http://localhost:3001/api/containers/nonexistent-id

# View error logs
curl http://localhost:3001/api/monitoring/logs?level=error

# View statistics
curl http://localhost:3001/api/monitoring/stats
```

### Frontend:
1. Navigate to the monitoring page
2. Trigger various errors (invalid inputs, network errors, etc.)
3. View errors in the monitoring dashboard
4. Test error boundary by causing a React error

## Future Improvements

1. **Persistent Storage**: Store logs in a database for long-term analysis
2. **Alerting**: Send notifications for critical errors
3. **Error Rate Monitoring**: Track error rates over time
4. **Error Grouping**: Group similar errors together
5. **Performance Metrics**: Add performance monitoring
6. **User Session Tracking**: Link errors to specific user sessions
7. **External Error Tracking**: Integrate with services like Sentry

## Configuration

### Backend
- Max logs stored: 1000 (configurable in `logger.ts`)
- Error handler includes stack traces in development mode

### Frontend
- Max logs stored: 100 (configurable in `errorService.ts`)
- Logs stored in localStorage
- Error boundary provides multiple recovery options

## Security Considerations

1. **Sensitive Data**: Error logs are filtered to prevent leaking sensitive information
2. **Stack Traces**: Only shown in development mode
3. **User Privacy**: User emails are not logged in error contexts
4. **Rate Limiting**: Consider adding rate limiting to monitoring endpoints in production
