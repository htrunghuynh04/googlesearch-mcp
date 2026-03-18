# WebSearch Tool - Test Scenarios

## 1. Test web_search Tool

### 1.1 Basic Search Test
```typescript
// Input
query: "AI in manufacturing"
num_results: 5

// Expected Output
[
  { "rank": 1, "title": "...", "url": "https://...", "snippet": "..." },
  { "rank": 2, ... },
  { "rank": 3, ... },
  { "rank": 4, ... },
  { "rank": 5, ... }
]
```

### 1.2 Search with Custom num_results
```typescript
// Test: num_results = 1
web_search(query: "SEO writing tips", num_results: 1)

// Expected: Return exactly 1 result
```

### 1.3 Search with Different Queries
```typescript
// Test cases:
- "SEO writing tips"
- "keyword research tools"
- "content marketing strategy"
- "machine learning tutorial"
- "best productivity apps 2025"
```

### 1.4 Search with Special Characters
```typescript
// Test:
query: "what is \"artificial intelligence\""
query: "site:wikipedia.org machine learning"
query: "tutorial -beginner"
```

---

## 2. Test fetch_webpage Tool

### 2.1 Basic Page Fetch
```typescript
// Input
url: "https://www.example.com/article"

// Expected Output
{
  "page_title": "...",
  "headings": {
    "H1": "Main Title",
    "H2": ["Section 1", "Section 2", "Section 3"],
    "H3": ["Subsection 1.1", "Subsection 1.2"]
  },
  "content": "Full article content..."
}
```

### 2.2 Fetch from Different Page Types
```typescript
// Test:
- Blog article: "https://blog.example.com/post"
- News: "https://news.example.com/article"
- Documentation: "https://docs.example.com/guide"
- Educational: "https://example.edu/article"
```

### 2.3 Error Handling Tests

#### Invalid URL
```typescript
// Input
url: "not-a-valid-url"

// Expected
{ "error": "Unable to retrieve webpage", "message": "..." }
```

#### Unreachable Website
```typescript
// Input
url: "https://this-domain-does-not-exist-12345.com"

// Expected
{ "error": "Unable to retrieve webpage", "message": "..." }
```

#### Blocked Website
```typescript
// Input
url: "https://www.netsuite.com/..."

// Expected (some sites block scrapers)
{ "error": "Unable to retrieve webpage", "message": "Access denied" }
```

---

## 3. Integration Test - SEO Writer Workflow

### 3.1 Complete SERP Research Flow
```typescript
// Step 1: Search for topic
web_search(query: "AI in manufacturing benefits", num_results: 10)

// Step 2: Select top URLs and fetch content
fetch_webpage(url: "https://www.sap.com/resources/ai-in-manufacturing")
fetch_webpage(url: "https://www.azumuta.com/blog/how-is-ai-used-in-manufacturing")

// Step 3: Extract headings for outline
// From fetch_webpage response:
// H1: "AI in Manufacturing"
// H2: ["What is AI in Manufacturing", "Applications", "Benefits", "Challenges"]
// H3: ["Predictive Maintenance", "Robotics Automation"]
```

---

## 4. Performance Tests

### 4.1 Search Response Time
```typescript
// Target: < 10 seconds
const start = Date.now();
web_search(query: "test", num_results: 5);
const duration = Date.now() - start;
// Assert: duration < 10000
```

### 4.2 Page Fetch Time
```typescript
// Target: < 10 seconds
const start = Date.now();
fetch_webpage(url: "https://example.com");
const duration = Date.now() - start;
// Assert: duration < 10000
```

---

## 5. Error Handling Tests

### 5.1 Empty Query
```typescript
web_search(query: "")
// Expected: Error or default 10 results
```

### 5.2 Very Long Query
```typescript
web_search(query: "a".repeat(1000))
// Expected: Handle gracefully
```

### 5.3 Invalid num_results
```typescript
web_search(query: "test", num_results: -1)
web_search(query: "test", num_results: 1000)
// Expected: Clamp to valid range (1-20)
```

---

## 6. Content Filtering Tests

### 6.1 Verify Ads Excluded
```typescript
// Search and verify results don't include:
// - Ads (sponsored results)
// - Login pages
// - Video pages
// - Forum threads
```

### 6.2 Priority Content Verification
```typescript
// Verify results include:
// - Blog articles
// - Guides
// - Educational content
// - Documentation pages
```

---

## 7. MCP Tool Registration Test

### 7.1 Verify Tools Registered
```typescript
// After MCP server starts, verify:
// - google-search tool exists
// - web_search tool exists
// - fetch_webpage tool exists
```

### 7.2 Tool Descriptions
```typescript
// Verify descriptions are in English
// No Chinese characters in tool metadata
```

---

## Test Execution Commands

```bash
# Run MCP server
npm run mcp:build

# Test with Claude Desktop or test client

# Manual test with Node.js
node test.mjs

# Test with specific query
npm run debug "AI in manufacturing"
```
