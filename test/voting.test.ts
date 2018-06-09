import { expect } from "chai";
import nock = require("nock");
import { Poll, BroadcastedPoll, IFormData } from "../src/poll";
import { NetworkTypes, NEMLibrary, Address, Account, TransactionTypes, PublicAccount, ServerConfig, TransactionHttp } from "nem-library";
import { PollConstants } from "../src/constants";
import { deriveOptionAddress } from "../src/utils";

describe("Voting", () => {
  let address: Address;
  let poiPoll: BroadcastedPoll;
  let yesAddress: Address;
  let noAddress: Address;
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
    yesAddress = deriveOptionAddress(address, "yes");
    noAddress = deriveOptionAddress(address, "no");
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
    const voteTransaction = poiPoll.vote("yes");
    const signed = account.signTransaction(voteTransaction);
    const transactionHttp = new TransactionHttp(nodes);
    transactionHttp.announceTransaction(signed)
      .subscribe((result) => {
        nk.done();
        expect(result.message).to.equal("SUCCESS");
        done();
      });
  });

  it("should get all the votes from an address to a poll", (done) => {
    nock("http://104.128.226.60:7890")
      .get("/account/transfers/incoming?address=" + yesAddress.plain() + "&pageSize=100")
      .once()
      .replyWithFile(200, __dirname + "/responses/transactions_1.json")
      .get("/account/transfers/incoming?address=" + noAddress.plain() + "&pageSize=100")
      .once()
      .replyWithFile(200, __dirname + "/responses/transactions_2.json")
      .get((uri) => {
        return uri.includes("/incoming");
      })
      .thrice()
      .replyWithFile(200, __dirname + "/responses/empty.json");
    poiPoll.getVotes(new Address("TBWHIYVVIW4UGTE2XCH44TDFOU3WDPOIE7MM4JGQ"))
      .subscribe((votes) => {
        expect(votes).to.not.be.a("null");
        expect(votes!.length).to.equal(1);
        expect(votes![0].type).to.equal(TransactionTypes.MULTISIG);
        done();
      });
  });

  it("should be able to broadcast a multisig vote", (done) => {
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
    const multisigAccount = PublicAccount.createWithPublicKey("a0277cf57efb7fbd5b76d5f66b197ea4da2cb03f277d0ce65795ddf75000b679");
    const voteTransaction = poiPoll.voteMultisig(multisigAccount, "yes");
    const signed = account.signTransaction(voteTransaction);
    const transactionHttp = new TransactionHttp(nodes);
    transactionHttp.announceTransaction(signed)
      .subscribe((result) => {
        nk.done();
        expect(result.message).to.equal("SUCCESS");
        done();
      });
  });
});
