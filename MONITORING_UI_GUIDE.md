# Monitoring Page UI Guide

## Page Location
`/dashboard/monitoring` - Accessible from the dashboard sidebar

## Page Layout

### Header Section
```
┌─────────────────────────────────────────────────────────────┐
│  Error Monitoring                           [Refresh Button] │
│  Track and manage application errors and logs                │
└─────────────────────────────────────────────────────────────┘
```

### Filters Section
```
┌─────────────────────────────────────────────────────────────┐
│  [🔍 Search logs...]              [Filter by Level ▼]       │
│                                    All Levels / Errors /     │
│                                    Warnings / Info           │
└─────────────────────────────────────────────────────────────┘
```

### Tabs Section
```
┌─────────────────────────────────────────────────────────────┐
│  [Frontend Logs] [Backend Logs]                             │
└─────────────────────────────────────────────────────────────┘
```

### Statistics Dashboard (shown in each tab)
```
┌───────────┬───────────┬───────────┬───────────┐
│   Total   │  Errors   │ Warnings  │   Info    │
│    125    │    15     │    45     │    65     │
│           │   (red)   │ (yellow)  │  (blue)   │
└───────────┴───────────┴───────────┴───────────┘
```

### Action Buttons
```
┌─────────────────────────────────────────────────────────────┐
│  [📥 Export]  [🗑️ Clear Logs]                               │
└─────────────────────────────────────────────────────────────┘
```

### Log Entries (repeated for each log)
```
┌─────────────────────────────────────────────────────────────┐
│  ⚠️  [ERROR]  Jan 08, 2026 01:55:04                         │
│  Failed to deploy container                                  │
│                                                              │
│  ▼ View context                                             │
│    {                                                         │
│      "name": "my-container",                                │
│      "image": "nginx:latest"                                │
│    }                                                         │
│                                                              │
│  ▼ View stack trace                                         │
│    Error: Docker image not found                            │
│      at deployContainer (/server/index.ts:165:11)           │
│      ...                                                     │
└─────────────────────────────────────────────────────────────┘
```

## Features

### 1. Real-time Updates
- Refresh button to get latest logs
- Auto-updates when navigating back to the page

### 2. Filtering
- **By Level**: Filter to show only errors, warnings, or info logs
- **By Search**: Search through log messages and context

### 3. Statistics
- **Total**: Total number of logs
- **Errors**: Count of error-level logs (red)
- **Warnings**: Count of warning-level logs (yellow)
- **Info**: Count of info-level logs (blue)

### 4. Log Details
Each log entry displays:
- **Icon**: Visual indicator (⚠️ for errors, ⚠ for warnings, ℹ for info)
- **Badge**: Color-coded level badge
- **Timestamp**: When the error occurred
- **Message**: Error message
- **Context**: Expandable section with additional details
- **Stack Trace**: Expandable section with error stack (for errors)

### 5. Export & Clear
- **Export**: Download logs as JSON file for analysis
- **Clear**: Remove all logs from storage

## Color Scheme

### Level Badges
- **ERROR**: Red badge (`destructive` variant)
- **WARNING**: Yellow badge (`default` variant)
- **INFO**: Blue/gray badge (`secondary` variant)

### Icons
- **ERROR**: `AlertCircle` (red)
- **WARNING**: `AlertTriangle` (yellow)
- **INFO**: `Info` (blue)

## Empty States

### No Logs
```
┌─────────────────────────────────────────────────────────────┐
│                                                              │
│                    📊 Activity Icon                          │
│                                                              │
│                  No frontend/backend logs                    │
│                                                              │
│         Logs will appear here when errors occur              │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### No Results from Filter/Search
```
┌─────────────────────────────────────────────────────────────┐
│                                                              │
│                    📊 Activity Icon                          │
│                                                              │
│                  No logs found                               │
│                                                              │
│         No logs match your search criteria                   │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## Navigation
The monitoring page is accessible from:
1. Dashboard sidebar: Click "Monitoring" (with AlertCircle icon)
2. Direct URL: `/dashboard/monitoring`

## User Flow

1. **View Logs**
   - Navigate to `/dashboard/monitoring`
   - Select "Frontend Logs" or "Backend Logs" tab
   - View statistics dashboard
   - Scroll through log entries

2. **Filter Logs**
   - Use search box to find specific logs
   - Use level dropdown to filter by error type
   - Click "Refresh" to get latest logs

3. **Investigate Error**
   - Click on log entry
   - Expand "View context" to see details
   - Expand "View stack trace" to see error stack
   - Copy information for debugging

4. **Export Logs**
   - Click "Export" button
   - JSON file downloads with all logs
   - Use for analysis or sharing

5. **Clear Logs**
   - Click "Clear Logs" button
   - Confirms and removes all logs
   - Useful after fixing issues

## Responsive Design
- Desktop: Full sidebar with statistics in row
- Tablet: Collapsible sidebar, statistics in 2x2 grid
- Mobile: Bottom navigation, statistics stacked

## Accessibility
- Keyboard navigation supported
- Screen reader friendly
- High contrast color schemes
- Clear error messages
- Focus indicators

## Performance
- Lazy loading for large log lists
- Pagination support (ready for implementation)
- Efficient filtering with client-side search
- Minimal re-renders with React optimizations
