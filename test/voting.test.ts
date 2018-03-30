import { expect } from "chai";
import nock = require("nock");
import { Poll, BroadcastedPoll, IFormData } from "../src/poll";
import { NetworkTypes, NEMLibrary, Address, Account } from "nem-library";
import { PollConstants } from "../src/constants";
import { deriveOptionAddress } from "../src/utils";

describe("Voting", () => {
  let address: Address;
  let poiPoll: BroadcastedPoll;

  beforeEach(() => {
    NEMLibrary.bootstrap(NetworkTypes.TEST_NET);
    address = new Address("TCFFOMQ2SBX77E2FZC3VX43ZTRV4ZNTXTCGWBM5J");
    const formDataPOI = {
      title: "test",
      doe: Date.now() + 1000000000,
      multiple: false,
      type: PollConstants.POI_POLL,
    } as IFormData;
    const yesAddress = deriveOptionAddress(address, "yes");
    const noAddress = deriveOptionAddress(address, "no");
    const link = {
      yes: yesAddress,
      no: noAddress,
    };
    poiPoll = new BroadcastedPoll(
      formDataPOI,
      "description",
      ["yes", "no"],
      address,
      link,
    );
  });

  afterEach(() => {
    NEMLibrary.reset();
    nock.cleanAll();
  });

  it("should correctly broadcast a vote", (done) => {
    const nk = nock("http://104.128.226.60:7890")
    .post("/transaction/announce", (body) => {
        expect(body).to.have.property("data");
        expect(body).to.have.property("signature");
        return true;
    })
    .once()
    .replyWithFile(200, __dirname + "/responses/announce_result.json");
    const testPrivateKey =
      "c195d7699662b0e2dfae6a4aef87a082d1000000000000000000000000000000";
    const account = Account.createWithPrivateKey(testPrivateKey);
    poiPoll.vote(account, "yes")
      .subscribe((result) => {
        nk.done();
        expect(result.message).to.equal("SUCCESS");
        done();
      });
  });
});
