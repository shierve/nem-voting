import { expect } from "chai";
import nock = require("nock");
import { Poll, BroadcastedPoll, IFormData } from "../src/poll";
import { NetworkTypes, NEMLibrary, Address } from "nem-library";
import { PollConstants } from "../src/constants";
import { getHeightByTimestamp } from "../src/utils";

describe("Utils", () => {

  afterEach(() => {
    NEMLibrary.reset();
  });

  it("should correctly find the height of the last block harvested at a given timestamp (testnet)", (done) => {
    NEMLibrary.bootstrap(NetworkTypes.TEST_NET);
    getHeightByTimestamp(1511049600000)
      .subscribe((height) => {
        expect(height).to.equal(1211682);
        done();
      });
  });

  it("should correctly find the height of the last block harvested at a given timestamp (mainnet)", (done) => {
    NEMLibrary.bootstrap(NetworkTypes.MAIN_NET);
    getHeightByTimestamp(1511049600000)
      .subscribe((height) => {
        expect(height).to.equal(1378429);
        done();
      });
  });
});
