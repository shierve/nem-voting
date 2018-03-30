import { expect } from "chai";
import nock = require("nock");
import { Poll, BroadcastedPoll, IFormData } from "../src/poll";
import { NetworkTypes, NEMLibrary, Address } from "nem-library";
import { PollConstants } from "../src/constants";
import { deriveOptionAddress } from "../src/utils";

describe("Vote Counting", () => {
  let address: Address;
  let poiPoll: BroadcastedPoll;
  let wPoll: BroadcastedPoll;

  beforeEach(() => {
    NEMLibrary.bootstrap(NetworkTypes.TEST_NET);
    address = new Address("TCFFOMQ2SBX77E2FZC3VX43ZTRV4ZNTXTCGWBM5J");
    const formDataPOI = {
      title: "test",
      doe: Date.now() + (1000000000),
      multiple: false,
      type: PollConstants.POI_POLL,
    } as IFormData;
    const formDataW = {
      title: "test",
      doe: Date.now() + (1000000000),
      multiple: false,
      type: PollConstants.WHITELIST_POLL,
    } as IFormData;
    const whitelist = [
      new Address("TCZUUQIWP6WLVNAXFR3ZZH3DDHHNWX3E4THPUVRI"),
      new Address("TB3AXQETJ4BWKHISCH3MFLLOJXS7GSF5JI5JBBVZ"),
    ];
    const yesAddress = deriveOptionAddress(address, "yes");
    const noAddress = deriveOptionAddress(address, "no");
    const link = {
      yes: yesAddress,
      no: noAddress,
    };
    poiPoll = new BroadcastedPoll(formDataPOI, "description", ["yes", "no"], address, link);
    wPoll = new BroadcastedPoll(formDataW, "description", ["yes", "no"], address, link, whitelist);
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
      .replyWithFile(200, __dirname + "/responses/empty.json")
      .post("/account/get/batch")
      .once()
      .replyWithFile(200, __dirname + "/responses/account_data.json");
  });

  afterEach(() => {
    NEMLibrary.reset();
    nock.cleanAll();
  });

  it("should count votes correctly on POI polls", (done) => {
    poiPoll.getResults()
      .subscribe((results) => {
        expect(results.totalVotes).to.be.equal(4);
        expect(results.options[0]).to.deep.equal({
          text: "yes",
          votes: 3,
          weighted: 0.9,
          percentage: 90,
        });
        expect(results.options[1]).to.deep.equal({
          text: "no",
          votes: 1,
          weighted: 0.1,
          percentage: 10,
        });
        done();
      });
  });

  it("should count votes correctly on whitelist polls", (done) => {
    wPoll.getResults()
      .subscribe((results) => {
        expect(results.totalVotes).to.be.equal(2);
        expect(results.options[0]).to.deep.equal({
          text: "yes",
          votes: 1,
          weighted: 1,
          percentage: 50,
        });
        expect(results.options[1]).to.deep.equal({
          text: "no",
          votes: 1,
          weighted: 1,
          percentage: 50,
        });
        done();
      });
  });
});
