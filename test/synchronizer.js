/*
 * This file is part of Adblock Plus <https://adblockplus.org/>,
 * Copyright (C) 2006-present eyeo GmbH
 *
 * Adblock Plus is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License version 3 as
 * published by the Free Software Foundation.
 *
 * Adblock Plus is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with Adblock Plus.  If not, see <http://www.gnu.org/licenses/>.
 */

"use strict";

const assert = require("assert");

let {
  createSandbox, setupTimerAndFetch, setupRandomResult, unexpectedError,
  LIB_FOLDER
} = require("./_common");

let MILLIS_IN_SECOND = null;
let MILLIS_IN_HOUR = null;
let filterNotifier = null;
let filterStorage = null;
let Prefs = null;
let Subscription = null;
let CountableSubscription = null;
let DownloadableSubscription = null;
let manifestVersion;

describe("Synchronizer", function() {
  let runner = {};
  let synchronizer = null;

  beforeEach(function() {
    runner = {};

    let globals = Object.assign({}, setupTimerAndFetch.call(runner), setupRandomResult.call(runner));
    let FilterStorage;
    let sandboxedRequire = createSandbox({globals});
    (
      {MILLIS_IN_SECOND, MILLIS_IN_HOUR} = sandboxedRequire(LIB_FOLDER + "/time"),
      {filterNotifier} = sandboxedRequire(LIB_FOLDER + "/filterNotifier"),
      {FilterStorage} = sandboxedRequire(LIB_FOLDER + "/filterStorage"),
      {Prefs} = sandboxedRequire("./stub-modules/prefs"),
      {manifestVersion} = sandboxedRequire("./stub-modules/info"),
      {Subscription, CountableSubscription, DownloadableSubscription} =
        sandboxedRequire(LIB_FOLDER + "/subscriptionClasses")
    );

    filterStorage = new FilterStorage();
    ({synchronizer} = filterStorage);
  });

  afterEach(function() {
    synchronizer = null;
  });

  function resetSubscription(subscription) {
    filterStorage.updateSubscriptionFilters(subscription, []);
    subscription.lastCheck = subscription.lastDownload =
      subscription.version = subscription.lastSuccess =
      subscription.expires = subscription.softExpiration = 0;
    subscription.title = "";
    subscription.homepage = null;
    subscription.errors = 0;
    subscription.downloadStatus = null;
    subscription.requiredVersion = null;
    subscription.abtest = null;
  }

  let initialDelay = 1 / 60;

  describe("It starts the synchronizer", function() {
    beforeEach(function() {
      synchronizer.start();
    });

    afterEach(function() {
      synchronizer.stop();
      Subscription.dnr = false;
    });

    it("A disabled subscription gets a version update", function() {
      let subscription = Subscription.fromURL("https://example.com/subscription");
      filterStorage.addSubscription(subscription);

      subscription.disabled = true;

      let requests = [];
      runner.registerHandler("/subscription", metadata => {
        assert.equal(metadata.query.get("manifestVersion"), manifestVersion);
        requests.push([runner.getTimeOffset(), metadata.method, metadata.path]);
        return [200, "[Adblock]\n! ExPiREs: 2day\nfoo\nbar"];
      });

      let notified = false;
      filterNotifier.on("subscription.updated", sub => {
        notified = sub === subscription;
      });

      return runner.runScheduledTasks(12).then(() => {
        assert.equal(notified, true);
        assert.equal(subscription.version, "202101071005");
        assert.deepEqual(requests, [
          [0 + initialDelay, "HEAD", "/subscription"]
        ], "Requests after 50 hours");
      }).catch(error => unexpectedError.call(assert, error));
    });

    it("A disabled subscription does not parse data", function() {
      let subscription = Subscription.fromURL("https://example.com/subscription");
      filterStorage.addSubscription(subscription);

      subscription.disabled = true;

      let requests = [];
      runner.registerHandler("/subscription", metadata => {
        let disabled = metadata.query.get("disabled");
        requests.push([runner.getTimeOffset(), metadata.method, metadata.path, disabled]);
        return [200, "[Adblock]\n! ExPiREs: 2day\nfoo\nbar"];
      });

      return runner.runScheduledTasks(50).then(() => {
        assert.deepEqual(requests, [
          [0 + initialDelay, "HEAD", "/subscription", "true"],
          [24 + initialDelay, "HEAD", "/subscription", "true"],
          [48 + initialDelay, "HEAD", "/subscription", "true"]
        ], "Requests after 50 hours");
      }).catch(error => unexpectedError.call(assert, error));
    });

    describe("Manifest V3 subscription", function() {
      beforeEach(function() {
        Subscription.dnr = true;
      });

      afterEach(function() {
        Subscription.dnr = false;
      });

      /*
       * In a Manifest V3 context, subscription are not updated (Downloadable)
       * albeit they need to contact the server to count.
       *
       * Also to test this, we need to use a subscription that is known, so
       * we can't use the example URL used in the other tests.
       */
      it("Does not parse data", function() {
        let subscription = Subscription.fromURL("https://easylist-downloads.adblockplus.org/easylist.txt");
        filterStorage.addSubscription(subscription);

        // We need to get the actual URL of the request to mock the fetch
        // query.
        let url = new URL(subscription.url);

        assert.ok(subscription instanceof CountableSubscription);
        assert.ok(!(subscription instanceof DownloadableSubscription));

        let requests = [];
        runner.registerHandler(url.pathname, metadata => {
          let disabled = metadata.query.get("disabled");
          assert.equal(metadata.query.get("manifestVersion"), manifestVersion);
          requests.push([runner.getTimeOffset(), metadata.method, metadata.path, disabled]);
          return [200, "[Adblock]\n! ExPiREs: 2day\nfoo\nbar"];
        });

        return runner.runScheduledTasks(50).then(() => {
          assert.deepEqual(requests, [
            [0 + initialDelay, "HEAD", url.pathname, "false"],
            [24 + initialDelay, "HEAD", url.pathname, "false"],
            [48 + initialDelay, "HEAD", url.pathname, "false"]
          ], "Requests after 50 hours");
        }).catch(error => unexpectedError.call(assert, error));
      });

      it("Sends subscription metadata for disabled subscription", function() {
        let subscription = Subscription.fromURL("https://easylist-downloads.adblockplus.org/easylist.txt");
        filterStorage.addSubscription(subscription);

        // We need to get the actual URL of the request to mock the fetch
        // query.
        let url = new URL(subscription.url);

        let requests = [];
        runner.registerHandler(url.pathname, metadata => {
          let disabled = metadata.query.get("disabled");
          let downloadCount = metadata.query.get("downloadCount");
          let lastVersion = metadata.query.get("lastVersion");
          requests.push([runner.getTimeOffset(), metadata.method, metadata.path, disabled, downloadCount, lastVersion]);
          return [200, "[Adblock]\n! ExPiREs: 2day\nfoo\nbar"];
        });

        // lastVersion is expected to always be set to 202101071005
        // because of the date header in the mocked response.
        return runner.runScheduledTasks(122).then(() => {
          assert.deepEqual(requests, [
            [0 + initialDelay, "HEAD", url.pathname, "false", "0", "0"],
            [24 + initialDelay, "HEAD", url.pathname, "false", "1", "202101071005"],
            [48 + initialDelay, "HEAD", url.pathname, "false", "2", "202101071005"],
            [72 + initialDelay, "HEAD", url.pathname, "false", "3", "202101071005"],
            [96 + initialDelay, "HEAD", url.pathname, "false", "4", "202101071005"],
            [120 + initialDelay, "HEAD", url.pathname, "false", "4+", "202101071005"]
          ], "Requests after 122 hours");
        }).catch(error => unexpectedError.call(assert, error));
      });

      it("Sends subscription metadata for disabled subscription", function() {
        let subscription = Subscription.fromURL("https://easylist-downloads.adblockplus.org/easylist.txt");
        filterStorage.addSubscription(subscription);

        subscription.disabled = true;

        // We need to get the actual URL of the request to mock the fetch
        // query.
        let url = new URL(subscription.url);

        let requests = [];
        runner.registerHandler(url.pathname, metadata => {
          let disabled = metadata.query.get("disabled");
          let downloadCount = metadata.query.get("downloadCount");
          let lastVersion = metadata.query.get("lastVersion");
          requests.push([runner.getTimeOffset(), metadata.method, metadata.path, disabled, downloadCount, lastVersion]);
          return [200, "[Adblock]\n! ExPiREs: 2day\nfoo\nbar"];
        });

        // lastVersion is expected to always be set to 202101071005
        // because of the date header in the mocked response.
        return runner.runScheduledTasks(50).then(() => {
          assert.deepEqual(requests, [
            [0 + initialDelay, "HEAD", url.pathname, "true", "0", "0"],
            [24 + initialDelay, "HEAD", url.pathname, "true", "0", "202101071005"],
            [48 + initialDelay, "HEAD", url.pathname, "true", "0", "202101071005"]
          ], "Requests after 50 hours");
        }).catch(error => unexpectedError.call(assert, error));
      });
    });

    it("A disabled subscription updates each day", function() {
      let subscription = Subscription.fromURL("https://example.com/subscription");
      filterStorage.addSubscription(subscription);

      subscription.disabled = true;

      let requests = [];
      runner.registerHandler("/subscription", metadata => {
        requests.push([runner.getTimeOffset(), metadata.method, metadata.path]);
        return [200, ""];
      });

      return runner.runScheduledTasks(130).then(() => {
        assert.deepEqual(requests, [
          [0 + initialDelay, "HEAD", "/subscription"],
          [24 + initialDelay, "HEAD", "/subscription"],
          [48 + initialDelay, "HEAD", "/subscription"],
          [72 + initialDelay, "HEAD", "/subscription"],
          [96 + initialDelay, "HEAD", "/subscription"],
          [120 + initialDelay, "HEAD", "/subscription"]
        ], "Requests after 50 hours");
      }).catch(error => unexpectedError.call(assert, error));
    });

    it("A disabled subscription downloads once enabled", function() {
      let subscription = Subscription.fromURL("https://example.com/subscription");
      filterStorage.addSubscription(subscription);

      subscription.disabled = true;

      let requests = [];
      runner.registerHandler("/subscription", metadata => {
        requests.push([runner.getTimeOffset(), metadata.method, metadata.path]);
        return [200, "[Adblock]\n! ExPiREs: 1day\nfoo\nbar"];
      });

      return runner.runScheduledTasks(30).then(() => {
        assert.deepEqual(requests, [
          [0 + initialDelay, "HEAD", "/subscription"],
          [24 + initialDelay, "HEAD", "/subscription"]
        ], "Requests after 30 hours");
      }).then(() => {
        requests = [];
        runner.registerHandler("/subscription", metadata => {
          requests.push([runner.getTimeOffset(), metadata.method, metadata.path]);
          return [200, "[Adblock]\n! ExPiREs: 1day\nfoo\nbar"];
        });
        subscription.disabled = false;
        return runner.runScheduledTasks(50).then(() => {
          assert.deepEqual(requests, [
            // The runner here starts right away from where it left and only
            // after the first callback it starts from 0 again. however, the 3
            // requests in 50 hours are expected and meant to happen.
            [30, "GET", "/subscription"],
            [24 + initialDelay, "GET", "/subscription"],
            [48 + initialDelay, "GET", "/subscription"]
          ], "Requests after 50 hours");
        });
      }).catch(error => unexpectedError.call(assert, error));
    });

    it("One subscription downloads", function() {
      let subscription = Subscription.fromURL("https://example.com/subscription");
      filterStorage.addSubscription(subscription);

      let requests = [];
      runner.registerHandler("/subscription", metadata => {
        assert.equal(metadata.query.get("manifestVersion"), manifestVersion);
        requests.push([runner.getTimeOffset(), metadata.method, metadata.path]);
        return [200, "[Adblock]\n! ExPiREs: 1day\nfoo\nbar"];
      });

      return runner.runScheduledTasks(50).then(() => {
        assert.deepEqual(requests, [
          [0 + initialDelay, "GET", "/subscription"],
          [24 + initialDelay, "GET", "/subscription"],
          [48 + initialDelay, "GET", "/subscription"]
        ], "Requests after 50 hours");
      }).catch(error => unexpectedError.call(assert, error));
    });

    it("Two subscriptions downloads", function() {
      let subscription1 = Subscription.fromURL(
        "https://example.com/subscription1");
      filterStorage.addSubscription(subscription1);

      let subscription2 = Subscription.fromURL(
        "https://example.com/subscription2");
      subscription2.expires =
        subscription2.softExpiration =
        (runner.currentTime + 2 * MILLIS_IN_HOUR) / MILLIS_IN_SECOND;
      filterStorage.addSubscription(subscription2);

      let requests = [];
      let handler = metadata => {
        requests.push([runner.getTimeOffset(), metadata.method, metadata.path]);
        return [200, "[Adblock]\n! ExPiREs: 1day\nfoo\nbar"];
      };

      runner.registerHandler("/subscription1", handler);
      runner.registerHandler("/subscription2", handler);

      return runner.runScheduledTasks(55).then(() => {
        assert.deepEqual(requests, [
          [0 + initialDelay, "GET", "/subscription1"],
          [2 + initialDelay, "GET", "/subscription2"],
          [24 + initialDelay, "GET", "/subscription1"],
          [26 + initialDelay, "GET", "/subscription2"],
          [48 + initialDelay, "GET", "/subscription1"],
          [50 + initialDelay, "GET", "/subscription2"]
        ], "Requests after 55 hours");
      }).catch(error => unexpectedError.call(assert, error));
    });

    describe("Subscription headers", function() {
      for (let currentTest of [
        {header: "[Adblock]", downloadStatus: "synchronize_ok", requiredVersion: null},
        {header: "[Adblock Plus]", downloadStatus: "synchronize_ok", requiredVersion: null},
        {header: "(something)[Adblock]", downloadStatus: "synchronize_ok", requiredVersion: null},
        {header: "[Adblock Plus 0.0.1]", downloadStatus: "synchronize_ok", requiredVersion: "0.0.1"},
        {header: "[Adblock  Plus 99.9]", downloadStatus: "synchronize_ok", requiredVersion: "99.9"},
        {header: "[Adblock 99.9]", downloadStatus: "synchronize_invalid_data", requiredVersion: null},
        {header: "[Foo]", downloadStatus: "synchronize_invalid_data", requiredVersion: null}
      ]) {
        it(currentTest.header, function() {
          let subscription = Subscription.fromURL(
            "https://example.com/subscription");
          filterStorage.addSubscription(subscription);

          runner.registerHandler("/subscription", metadata => {
            return [200, currentTest.header + "\n!Expires: 8 hours\nfoo\n!bar\n\n@@bas\n#bam"];
          });

          return runner.runScheduledTasks(2).then(() => {
            assert.equal(subscription.downloadStatus, currentTest.downloadStatus, "Download status");
            assert.equal(subscription.requiredVersion, currentTest.requiredVersion, "Required version");

            if (currentTest.downloadStatus == "synchronize_ok") {
              assert.deepEqual([...subscription.filterText()], ["foo", "!bar", "@@bas", "#bam"], "Resulting subscription filters");
            }
            else {
              assert.deepEqual([...subscription.filterText()], [
              ], "Resulting subscription filters");
            }
          }).catch(error => unexpectedError.call(assert, error));
        });
      }
    });

    it("Disabled updates", function() {
      Prefs.subscriptions_autoupdate = false;

      let subscription = Subscription.fromURL("https://example.com/subscription");
      filterStorage.addSubscription(subscription);

      let requests = 0;
      runner.registerHandler("/subscription", metadata => {
        requests++;
        throw new Error("Unexpected request");
      });

      return runner.runScheduledTasks(50).then(() => {
        assert.equal(requests, 0, "Request count");
      }).catch(error => unexpectedError.call(assert, error));
    });

    describe("Expiration time", function() {
      for (let currentTest of [
        {
          expiration: "default",
          randomResult: 0.5,
          requests: [0 + initialDelay, 5 * 24 + initialDelay]
        },
        {
          expiration: "1 hours",  // Minimal expiration interval
          randomResult: 0.5,
          requests: [0 + initialDelay, 1 + initialDelay, 2 + initialDelay, 3 + initialDelay]
        },
        {
          expiration: "26 hours",
          randomResult: 0.5,
          requests: [0 + initialDelay, 26 + initialDelay]
        },
        {
          expiration: "2 days",
          randomResult: 0.5,
          requests: [0 + initialDelay, 48 + initialDelay]
        },
        {
          expiration: "20 days",  // Too large, will be corrected
          randomResult: 0.5,
          requests: [0 + initialDelay, 14 * 24 + initialDelay]
        },
        {
          expiration: "35 hours",
          randomResult: 0,        // Changes interval by factor 0.8
          requests: [0 + initialDelay, 28 + initialDelay]
        },
        {
          expiration: "35 hours",
          randomResult: 1,        // Changes interval by factor 1.2
          requests: [0 + initialDelay, 42 + initialDelay]
        },
        {
          expiration: "35 hours",
          randomResult: 0.25,     // Changes interval by factor 0.9
          requests: [0 + initialDelay, 32 + initialDelay]
        },
        {
          expiration: "40 hours",
          randomResult: 0.5,
          skipAfter: 5 + initialDelay,
          skip: 10,               // Short break should not increase soft expiration
          requests: [0 + initialDelay, 40 + initialDelay]
        },
        {
          expiration: "40 hours",
          randomResult: 0.5,
          skipAfter: 5 + initialDelay,
          skip: 30,               // Long break should increase soft expiration
          requests: [0 + initialDelay, 70 + initialDelay]
        },
        {
          expiration: "40 hours",
          randomResult: 0.5,
          skipAfter: 5 + initialDelay,
          skip: 80,               // Hitting hard expiration, immediate download
          requests: [0 + initialDelay, 85 + initialDelay]
        }
      ]) {
        let testId = `"${currentTest.expiration}"`;
        if (currentTest.randomResult != 0.5)
          testId += " with Math.random() returning " + currentTest.randomResult;
        if (currentTest.skip)
          testId += " skipping " + currentTest.skip + " hours after " + currentTest.skipAfter + " hours";

        it(testId, function() {
          let subscription = Subscription.fromURL("https://example.com/subscription");
          filterStorage.addSubscription(subscription);

          let requests = [];
          runner.registerHandler("/subscription", metadata => {
            requests.push(runner.getTimeOffset());
            return [200, "[Adblock]\n!Expires: " + currentTest.expiration + "\nbar"];
          });

          runner.randomResult = currentTest.randomResult;

          let maxHours = Math.round(Math.max.apply(null, currentTest.requests)) + 1;
          return runner.runScheduledTasks(maxHours, currentTest.skipAfter, currentTest.skip).then(() => {
            assert.deepEqual(requests, currentTest.requests, "Requests");
          }).catch(error => unexpectedError.call(assert, error));
        });
      }
    });

    describe("Special comments", function() {
      for (let [comment, check] of [
        ["! Homepage: http://example.com/", subscription => {
          assert.equal(subscription.homepage, "http://example.com/", "Valid homepage comment");
        }],
        ["! Homepage: ssh://example.com/", subscription => {
          assert.equal(subscription.homepage, null, "Invalid homepage comment");
        }],
        ["! Title: foo", subscription => {
          assert.equal(subscription.title, "foo", "Title comment");
          assert.equal(subscription.fixedTitle, true, "Fixed title");
        }],
        ["! Version: 1234", subscription => {
          assert.equal(subscription.version, 1234, "Version comment");
        }]
      ]) {
        it(comment, function() {
          let subscription = Subscription.fromURL("https://example.com/subscription");
          filterStorage.addSubscription(subscription);

          runner.registerHandler("/subscription", metadata => {
            return [200, "[Adblock]\n" + comment + "\nfoo\nbar"];
          });

          return runner.runScheduledTasks(2).then(() => {
            check(subscription);
            assert.deepEqual([...subscription.filterText()], ["foo", "bar"], "Special comment not added to filters");
          }).catch(error => unexpectedError.call(assert, error));
        });
      }

      it("! Abtest: bar", function() {
        let comment = "! Abtest: bar";
        let check = subscription => {
          assert.equal(subscription.abtest, "bar", "ABTest comment");
        };

        // We have to check a url from `subscriptions.json`, hence the use of
        // non-`example.com` url.
        // If the `subscriptions.json` file was changed, or if it is replaced
        // by some process at build time, and this test fails, then you need
        // to double check that the subscription is still in there (`mv2_url`)
        // and that it does have a type value.
        let subscription = Subscription.fromURL("https://easylist-downloads.adblockplus.org/easyprivacy.txt");
        filterStorage.addSubscription(subscription);

        runner.registerHandler("/easyprivacy.txt", metadata => {
          return [200, "[Adblock]\n" + comment + "\nfoo\nbar"];
        });

        return runner.runScheduledTasks(2).then(() => {
          check(subscription);
          assert.deepEqual([...subscription.filterText()], ["foo", "bar"], "Special comment not added to filters");
        }).catch(error => unexpectedError.call(assert, error));
      });
    });

    it("HTTPS", async function() {
      try {
        // Test direct HTTP-only download.
        let subscriptionDirectHTTP =
          Subscription.fromURL("http://example.com/subscription");
        filterStorage.addSubscription(subscriptionDirectHTTP);

        let requestCount = 0;

        runner.registerHandler(
          "/subscription",
          metadata => (requestCount++, [200, "[Adblock]\nmalicious-filter"])
        );

        await runner.runScheduledTasks(1);

        assert.equal(subscriptionDirectHTTP.downloadStatus,
                     "synchronize_invalid_url",
                     "Invalid URL error recorded");
        assert.equal(requestCount, 0, "Number of requests");
        assert.equal(subscriptionDirectHTTP.errors, 1, "Number of download errors");

        // Test indirect HTTPS-to-HTTP download.
        let subscriptionIndirectHTTP =
          Subscription.fromURL("https://example.com/subscription");
        filterStorage.removeSubscription([...filterStorage.subscriptions()][0]);
        filterStorage.addSubscription(subscriptionIndirectHTTP);

        requestCount = 0;

        runner.registerHandler(
          "/subscription",
          metadata => (
            requestCount++,
            [301, "", {Location: "http://malicious.example.com/redirected"}]
          )
        );

        runner.registerHandler(
          "/redirected",
          metadata => (requestCount++, [200, "[Adblock]\nmalicious-filter"])
        );

        await runner.runScheduledTasks(1);

        assert.equal(subscriptionIndirectHTTP.downloadStatus,
                     "synchronize_connection_error",
                     "Connection error recorded");
        assert.equal(requestCount, 2, "Number of requests");
        assert.equal(subscriptionIndirectHTTP.errors, 1, "Number of download errors");

        // Test indirect HTTPS-to-HTTP-to-HTTPS download.
        let subscriptionIndirectHTTPS =
          Subscription.fromURL("https://front.example.com/subscription");
        filterStorage.removeSubscription([...filterStorage.subscriptions()][0]);
        filterStorage.addSubscription(subscriptionIndirectHTTPS);

        requestCount = 0;

        runner.registerHandler(
          "/subscription",
          metadata =>
            (requestCount++, [301, "",
                              {Location: "http://redirect.example.com/"}])
        );

        runner.registerHandler(
          "/",
          metadata => (
            requestCount++,
            [301, "", {Location: "https://example.com/subscription-1.0"}]
          )
        );

        runner.registerHandler(
          "/subscription-1.0",
          metadata => (requestCount++, [200, "[Adblock]\ngood-filter"])
        );

        await runner.runScheduledTasks(1);

        assert.equal(subscriptionIndirectHTTPS.downloadStatus, "synchronize_ok");
        assert.equal(requestCount, 3, "Number of requests");
        assert.equal(subscriptionIndirectHTTPS.errors, 0, "Number of download errors");
        assert.deepEqual([...subscriptionIndirectHTTPS.filterText()], ["good-filter"], "Resulting subscription filters");

        let subscriptionDirectHTTPLoopback =
          Subscription.fromURL("http://127.0.0.1/subscription");
        filterStorage.addSubscription(subscriptionDirectHTTPLoopback);

        requestCount = 0;

        runner.registerHandler(
          "/subscription",
          metadata => (requestCount++, [200, "[Adblock]\ntest-filter"])
        );

        await runner.runScheduledTasks(1);

        assert.equal(subscriptionDirectHTTPLoopback.downloadStatus,
                     "synchronize_ok");
        assert.equal(requestCount, 1, "Number of requests");
        assert.equal(subscriptionDirectHTTPLoopback.errors, 0, "Number of download errors");
        assert.deepEqual([...subscriptionDirectHTTPLoopback.filterText()],
                         ["test-filter"],
                         "Resulting subscription filters");
      }
      catch (error) {
        unexpectedError.call(assert, error);
      }
    });

    it("Redirects", function() {
      let subscription = Subscription.fromURL("https://example.com/subscription");
      filterStorage.addSubscription(subscription);

      runner.registerHandler("/subscription", metadata => {
        return [200, "[Adblock]\n!Redirect: https://example.com/redirected\nbar"];
      });

      let requests;

      return runner.runScheduledTasks(30).then(() => {
        assert.equal([...filterStorage.subscriptions()][0], subscription, "Invalid redirect ignored");
        assert.equal(subscription.downloadStatus, "synchronize_connection_error", "Connection error recorded");
        assert.equal(subscription.errors, 2, "Number of download errors");

        requests = [];

        runner.registerHandler("/redirected", metadata => {
          requests.push(runner.getTimeOffset());
          return [200, "[Adblock]\n! Expires: 8 hours\nbar"];
        });

        resetSubscription(subscription);
        return runner.runScheduledTasks(15);
      }).then(() => {
        assert.equal([...filterStorage.subscriptions()][0].url, "https://example.com/redirected", "Redirect followed");
        assert.deepEqual(requests, [0 + initialDelay, 8 + initialDelay], "Resulting requests");

        runner.registerHandler("/redirected", metadata => {
          return [200, "[Adblock]\n!Redirect: https://example.com/subscription\nbar"];
        });

        subscription = Subscription.fromURL("https://example.com/subscription");
        resetSubscription(subscription);
        filterStorage.removeSubscription([...filterStorage.subscriptions()][0]);
        filterStorage.addSubscription(subscription);

        return runner.runScheduledTasks(2);
      }).then(() => {
        assert.equal([...filterStorage.subscriptions()][0], subscription, "Redirect not followed on redirect loop");
        assert.equal(subscription.downloadStatus, "synchronize_connection_error", "Download status after redirect loop");
      }).catch(error => unexpectedError.call(assert, error));
    });

    it("Fallback", function() {
      Prefs.subscriptions_fallbackerrors = 3;
      Prefs.subscriptions_fallbackurl = "https://example.com/fallback?%SUBSCRIPTION%&%RESPONSESTATUS%";

      let subscription = Subscription.fromURL("https://example.com/subscription");
      filterStorage.addSubscription(subscription);

      // No valid response from fallback

      let requests = [];
      let fallbackParams;
      let redirectedRequests;
      runner.registerHandler("/subscription", metadata => {
        requests.push(runner.getTimeOffset());
        return [404];
      });

      return runner.runScheduledTasks(100).then(() => {
        assert.deepEqual(requests, [0 + initialDelay, 24 + initialDelay, 48 + initialDelay, 72 + initialDelay, 96 + initialDelay], "Continue trying if the fallback doesn't respond");

        // Fallback giving "Gone" response

        resetSubscription(subscription);
        requests = [];
        fallbackParams = null;
        runner.registerHandler("/fallback", metadata => {
          fallbackParams = decodeURIComponent(metadata.queryString);
          return [200, "410 Gone"];
        });

        return runner.runScheduledTasks(100);
      }).then(() => {
        assert.deepEqual(requests, [0 + initialDelay, 24 + initialDelay, 48 + initialDelay], "Stop trying if the fallback responds with Gone");
        assert.equal(fallbackParams, "https://example.com/subscription&404", "Fallback arguments");

        // Fallback redirecting to a missing file

        subscription = Subscription.fromURL("https://example.com/subscription");
        resetSubscription(subscription);
        filterStorage.removeSubscription([...filterStorage.subscriptions()][0]);
        filterStorage.addSubscription(subscription);
        requests = [];

        runner.registerHandler("/fallback", metadata => {
          return [200, "301 https://example.com/redirected"];
        });
        return runner.runScheduledTasks(100);
      }).then(() => {
        assert.equal([...filterStorage.subscriptions()][0].url, "https://example.com/subscription", "Ignore invalid redirect from fallback");
        assert.deepEqual(requests, [0 + initialDelay, 24 + initialDelay, 48 + initialDelay, 72 + initialDelay, 96 + initialDelay], "Requests not affected by invalid redirect");

        // Fallback redirecting to an existing file

        resetSubscription(subscription);
        requests = [];
        redirectedRequests = [];
        runner.registerHandler("/redirected", metadata => {
          redirectedRequests.push(runner.getTimeOffset());
          return [200, "[Adblock]\n!Expires: 1day\nfoo\nbar"];
        });

        return runner.runScheduledTasks(100);
      }).then(() => {
        assert.equal([...filterStorage.subscriptions()][0].url, "https://example.com/redirected", "Valid redirect from fallback is followed");
        assert.deepEqual(requests, [0 + initialDelay, 24 + initialDelay, 48 + initialDelay], "Stop polling original URL after a valid redirect from fallback");
        assert.deepEqual(redirectedRequests, [48 + initialDelay, 72 + initialDelay, 96 + initialDelay], "Request new URL after a valid redirect from fallback");

        // Redirect loop

        runner.registerHandler("/subscription", metadata => {
          return [200, "[Adblock]\n! Redirect: https://example.com/subscription2"];
        });
        runner.registerHandler("/subscription2", metadata => {
          return [200, "[Adblock]\n! Redirect: https://example.com/subscription"];
        });

        subscription = Subscription.fromURL("https://example.com/subscription");
        resetSubscription(subscription);
        filterStorage.removeSubscription([...filterStorage.subscriptions()][0]);
        filterStorage.addSubscription(subscription);

        return runner.runScheduledTasks(100);
      }).then(() => {
        assert.equal([...filterStorage.subscriptions()][0].url, "https://example.com/redirected", "Fallback can still redirect even after a redirect loop");
      }).catch(error => unexpectedError.call(assert, error));
    });

    it("State fields", function() {
      let subscription = Subscription.fromURL("https://example.com/subscription");
      filterStorage.addSubscription(subscription);

      runner.registerHandler("/subscription", metadata => {
        return [200, "[Adblock]\n! Expires: 2 hours\nfoo\nbar"];
      });

      let startTime = runner.currentTime;
      return runner.runScheduledTasks(2).then(() => {
        assert.equal(subscription.downloadStatus, "synchronize_ok", "downloadStatus after successful download");
        assert.equal(subscription.lastDownload * MILLIS_IN_SECOND, startTime + initialDelay * MILLIS_IN_HOUR, "lastDownload after successful download");
        assert.equal(subscription.lastSuccess * MILLIS_IN_SECOND, startTime + initialDelay * MILLIS_IN_HOUR, "lastSuccess after successful download");
        assert.equal(subscription.lastCheck * MILLIS_IN_SECOND, startTime + (1 + initialDelay) * MILLIS_IN_HOUR, "lastCheck after successful download");
        assert.equal(subscription.errors, 0, "errors after successful download");

        runner.registerHandler("/subscription", metadata => {
          return [0];
        });

        return runner.runScheduledTasks(2);
      }).then(() => {
        assert.equal(subscription.downloadStatus, "synchronize_connection_error", "downloadStatus after connection error");
        assert.equal(subscription.lastDownload * MILLIS_IN_SECOND, startTime + (2 + initialDelay) * MILLIS_IN_HOUR, "lastDownload after connection error");
        assert.equal(subscription.lastSuccess * MILLIS_IN_SECOND, startTime + initialDelay * MILLIS_IN_HOUR, "lastSuccess after connection error");
        assert.equal(subscription.lastCheck * MILLIS_IN_SECOND, startTime + (3 + initialDelay) * MILLIS_IN_HOUR, "lastCheck after connection error");
        assert.equal(subscription.errors, 1, "errors after connection error");

        runner.registerHandler("/subscription", metadata => {
          return [404];
        });

        return runner.runScheduledTasks(24);
      }).then(() => {
        assert.equal(subscription.downloadStatus, "synchronize_connection_error", "downloadStatus after download error");
        assert.equal(subscription.lastDownload * MILLIS_IN_SECOND, startTime + (26 + initialDelay) * MILLIS_IN_HOUR, "lastDownload after download error");
        assert.equal(subscription.lastSuccess * MILLIS_IN_SECOND, startTime + initialDelay * MILLIS_IN_HOUR, "lastSuccess after download error");
        assert.equal(subscription.lastCheck * MILLIS_IN_SECOND, startTime + (27 + initialDelay) * MILLIS_IN_HOUR, "lastCheck after download error");
        assert.equal(subscription.errors, 2, "errors after download error");
      }).catch(error => unexpectedError.call(assert, error));
    });

    it("Special comment ordering", function() {
      let subscription = Subscription.fromURL("https://example.com/subscription");
      filterStorage.addSubscription(subscription);

      runner.registerHandler("/subscription", metadata => {
        return [200, "[Adblock]\n! Special Comment: x\n!foo\n! Title: foobar\nfoo\nbar"];
      });

      return runner.runScheduledTasks(1).then(() => {
        assert.equal(subscription.title, "https://example.com/subscription", "make sure title was not found");
      }).catch(error => unexpectedError.call(assert, error));
    });

    it("Unknown special comments", function() {
      let subscription = Subscription.fromURL("https://example.com/subscription");
      filterStorage.addSubscription(subscription);

      runner.registerHandler("/subscription", metadata => {
        // To test allowing unknown special comments like `! :`, `!!@#$%^&*() : `, and `! Some Unknown Comment : `
        return [200, "[Adblock]\n! :\n! !@#$%^&*() :\n! Some Unknown Comment :\n! Title: foobar\nfoo\nbar"];
      });

      return runner.runScheduledTasks(1).then(() => {
        assert.equal(subscription.title, "foobar", "make sure title was found");
      }).catch(error => unexpectedError.call(assert, error));
    });

    it("Stop scheduled checks", function() {
      // cast synchronizer._downloader._timeout to avoid trusting
      // a static value that could be different per env
      assert.strictEqual(synchronizer._started, true, "Synchronizer started");
      assert.strictEqual(!!synchronizer._downloader._timeout, true, "Downloader scheduled");
      synchronizer.stop();
      assert.strictEqual(synchronizer._started, false, "Synchronizer stopped");
      assert.strictEqual(!!synchronizer._downloader._timeout, false, "Downloader unscheduled");
    });

    it("Receives different timing when Prefs define these", function() {
      let interval = 0;
      let delay = 0;

      // stub scheduleChecks to trap received arguments
      let {scheduleChecks} = synchronizer._downloader;
      synchronizer._downloader.scheduleChecks = (_interval, _delay) => {
        [interval, delay] = [_interval, _delay];
      };

      // overwrite timers
      Prefs.subscriptions_check_interval = 123;
      Prefs.subscriptions_initial_delay = 456;

      // ensure synchronizer state and test
      synchronizer.stop();
      synchronizer.start();

      assert.strictEqual(interval, 123, "Received expected interval");
      assert.strictEqual(delay, 456, "Received expected delay");

      // for cleanup sake (future tests)
      delete Prefs.subscriptions_check_interval;
      delete Prefs.subscriptions_initial_delay;
      synchronizer._downloader.scheduleChecks = scheduleChecks;
    });
  });

  it("Adds subscription without starting", function() {
    let subscription = Subscription.fromURL("https://example.com/subscription");
    let onError = () => {
      assert.fail("This should not happen");
    };
    synchronizer.addSubscriptionFilters(subscription, "[Adblock]\nfoo\nbar", onError);
  });
});
