import { expect } from "chai";
import nock = require("nock");
import { Poll, BroadcastedPoll, IFormData } from "../src/poll";
import { NetworkTypes, NEMLibrary, Address } from "nem-library";
import { POI_POLL, WHITELIST_POLL } from "../src/constants";
import { deriveOptionAddress } from "../src/utils";

describe("Vote Counting", () => {

  beforeEach(() => {
      //
  });

  afterEach(() => {
    NEMLibrary.reset();
    nock.cleanAll();
  });
});
