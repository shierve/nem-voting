import { expect } from "chai";
import nock = require("nock");
import { Poll, BroadcastedPoll, IFormData, UnbroadcastedPoll } from "../src/poll";
import { NetworkTypes, NEMLibrary, Address, Account, TransactionHttp, ServerConfig } from "nem-library";
import { PollConstants } from "../src/constants";
import { deriveOptionAddress } from "../src/utils";
import { Observable } from "rxjs";

describe("Poll Creation", () => {
  let address: Address;
  let poiPoll: UnbroadcastedPoll;
  const nodes: ServerConfig[] = [
    {protocol: "http", domain: "104.128.226.60", port: 7890},
  ];

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
    const broadcastData = poiPoll.broadcast(account.publicKey);
    expect(broadcastData.broadcastedPoll).to.have.property("address");
    expect(broadcastData.broadcastedPoll).to.have.property("optionAddresses");
    expect(broadcastData.transactions.length).to.equal(4);
    const transactionHttp = new TransactionHttp(nodes);
    Observable.merge(...(broadcastData.transactions.map((t) => {
      const signed = account.signTransaction(t);
      return transactionHttp.announceTransaction(signed);
    })))
      .last()
      .subscribe(() => {
        nk.done();
        done();
      });
  });

  it("broadcasted polls should be valid", (done) => {
    const testPrivateKey =
      "c195d7699662b0e2dfae6a4aef87a082d1000000000000000000000000000000";
    const account = Account.createWithPrivateKey(testPrivateKey);
    const broadcastData = poiPoll.broadcast(account.publicKey);
    expect(broadcastData.broadcastedPoll).to.have.property("address");
    expect(broadcastData.broadcastedPoll).to.have.property("optionAddresses");
    expect(broadcastData.broadcastedPoll.validate()).to.equal(true);
    done();
  });
});
