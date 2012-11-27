// Run tests using JsTestDriver

RecoveryTest = TestCase("RecoveryTest");

// Add a test function to MicroXMLTest for each test case in tests.json.
(function() {
    // Have to have a little helper function here to make closures work right.
    function def(source, result) {
	return function () {
	    var actualResult = undefined;
	    var exception = undefined;
	    expectAsserts(1);
	    actualResult = parseMicroXML(source);
	    assertEquals("incorrect parse result:", result, actualResult);
	};
    }
    var i;
    var tests;
    var request = new XMLHttpRequest();
    // JSTestDriver serves up documents under the /test directory.
    request.open("GET", "/test/tests.json", false);
    request.send();
    tests = JSON.parse(request.responseText);
    for (i = 0; i < tests.length; i++) {
	var t = tests[i];
	var result = t.result;
	if (!result)
	    result = t.recover;
	if (result)
	    RecoveryTest.prototype["test " + t.id] = def(t.source, result);
    }
})();

