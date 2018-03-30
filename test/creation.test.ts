import { expect } from "chai";
import nock = require("nock");
import { Poll, BroadcastedPoll, IFormData, UnbroadcastedPoll } from "../src/poll";
import { NetworkTypes, NEMLibrary, Address, Account } from "nem-library";
import { PollConstants } from "../src/constants";
import { deriveOptionAddress } from "../src/utils";

describe("Poll Creation", () => {
  let address: Address;
  let poiPoll: UnbroadcastedPoll;

  beforeEach(() => {
    NEMLibrary.bootstrap(NetworkTypes.TEST_NET);
    address = new Address("TCFFOMQ2SBX77E2FZC3VX43ZTRV4ZNTXTCGWBM5J");
    const formDataPOI = {
      title: "test",
      doe: Date.now() + 1000000000,
      multiple: false,
      type: PollConstants.POI_POLL,
    } as IFormData;
    poiPoll = new UnbroadcastedPoll(
      formDataPOI,
      "description",
      ["yes", "no"],
    );
  });

  afterEach(() => {
    NEMLibrary.reset();
    nock.cleanAll();
  });

  it("should correctly broadcast a poll", (done) => {
    const nk = nock("http://104.128.226.60:7890")
    .post("/transaction/announce", (body) => {
        expect(body).to.have.property("data");
        expect(body).to.have.property("signature");
        return true;
    })
    .times(4)
    .replyWithFile(200, __dirname + "/responses/announce_result.json");
    const testPrivateKey =
      "c195d7699662b0e2dfae6a4aef87a082d1000000000000000000000000000000";
    const account = Account.createWithPrivateKey(testPrivateKey);
    poiPoll.broadcast(account)
      .subscribe((broadcastedPoll) => {
        nk.done();
        expect(broadcastedPoll).to.have.property("address");
        expect(broadcastedPoll).to.have.property("optionAddresses");
        done();
      });
  });

  it("broadcasted polls should be valid", (done) => {
    const nk = nock("http://104.128.226.60:7890")
    .post("/transaction/announce", (body) => {
        expect(body).to.have.property("data");
        expect(body).to.have.property("signature");
        return true;
    })
    .times(4)
    .replyWithFile(200, __dirname + "/responses/announce_result.json");
    const testPrivateKey =
      "c195d7699662b0e2dfae6a4aef87a082d1000000000000000000000000000000";
    const account = Account.createWithPrivateKey(testPrivateKey);
    poiPoll.broadcast(account)
      .subscribe((broadcastedPoll) => {
        nk.done();
        expect(broadcastedPoll).to.have.property("address");
        expect(broadcastedPoll).to.have.property("optionAddresses");
        expect(broadcastedPoll.validate()).to.equal(true);
        done();
      });
  });
});
