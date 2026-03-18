import { googleSearch, fetchWebpage, formatWebSearchResults } from './dist/src/search.js';

async function test1_web_search() {
  console.log('\n=== Test 1: web_search ===\n');
  const results = await googleSearch("AI in manufacturing benefits", { limit: 5, headless: false });
  const webResults = formatWebSearchResults(results.results, 5);
  console.log('Search Results:');
  console.log(JSON.stringify(webResults, null, 2));
  return webResults;
}

async function test2_fetch_webpage(url) {
  console.log(`\n=== Test 2: fetch_webpage ===\n`);
  console.log('Fetching:', url);
  const content = await fetchWebpage(url);
  console.log('Page Title:', content.page_title);
  console.log('H1:', content.headings.H1);
  console.log('H2:', content.headings.H2.slice(0, 5));
  console.log('H3:', content.headings.H3.slice(0, 5));
  console.log('Content length:', content.content.length);
  return content;
}

async function runTests() {
  try {
    // Test 1: web_search
    const searchResults = await test1_web_search();

    // Test 2: fetch_webpage - use known working URL first
    console.log('\n=== Test 2: fetch_webpage (known working URL) ===\n');
    const workingUrl = "https://verysell.ai/ai-in-manufacturing-top-10-best-benefits-use-cases/";
    await test2_fetch_webpage(workingUrl);

    // Test 3: fetch_webpage - try SAP (now should work with optimization)
    console.log('\n=== Test 3: fetch_webpage (SAP - optimized) ===\n');
    const sapUrl = "https://www.sap.com/resources/ai-in-manufacturing";
    try {
      await test2_fetch_webpage(sapUrl);
      console.log('✅ SAP access successful!');
    } catch (e) {
      console.log('❌ SAP failed:', e.message);
    }

    console.log('\n✅ All tests completed!');
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
  }
}

runTests();
