import { expect } from "chai";
import { Poll, BroadcastedPoll, IFormData } from "../src/poll";
import { NetworkTypes, NEMLibrary, Address, Account } from "nem-library";
import { PollConstants } from "../src/constants";

describe("Poll fetching", () => {
  let address: Address;

  beforeEach(() => {
    NEMLibrary.bootstrap(NetworkTypes.TEST_NET);
    address = new Address("TB67BUOLRSVYABQ4BLSNEZXOFGGLICEHWAPBZQE4");
  });

  afterEach(() => {
    NEMLibrary.reset();
  });

  it("should correctly get a broadcasted poll from the blockchain", (done) => {
    BroadcastedPoll.fromAddress(address)
      .subscribe((poll) => {
        expect(poll.data.formData.title).to.equal("this time for real");
        expect(poll.data.formData.doe).to.equal(1521028782380);
        expect(poll.data.formData.type).to.equal(PollConstants.POI_POLL);
        done();
      });
  });
});
