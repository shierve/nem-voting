import { Address, NEMLibrary, NetworkTypes, PublicAccount, Account } from "nem-library";
import { Poll, BroadcastedPoll, UnbroadcastedPoll } from "./src/poll";
import { getWhitelistResults, getPOIResults, getPOIResultsCsv } from "./src/counting";
import { getHeightByTimestamp, generatePollAddress } from "./src/utils";
import { POI_POLL } from "./src/constants";

// NEMLibrary.bootstrap(NetworkTypes.TEST_NET);
const pollAddress = new Address("NALYCSZ5AUN4MZZNPVTPXMAHT7U6RHWIO4AGKYA2");
const testPrivateKey = "c195d7699662b0e2dfae6a4aef87a082d11f74d2bd583f7dec5663a107823691";

// BroadcastedPoll.fromAddress(pollAddress)
//     .switchMap((poll) => {
//         // console.log("details:", poll);
//         return getPOIResults(poll);
//     })
//     .subscribe((results) => {
//         console.log(results);
//     });

// const formData = {
//     title: "test poll",
//     doe: Date.now() + (60 * 1000 * 60),
//     type: POI_POLL,
//     multiple: false,
// };
// const description = "Hello this is a poll.";
// const options = ["this is awesome", "this is super awesome"];

// const poll = new UnbroadcastedPoll(formData, description, options);
// const account = Account.createWithPrivateKey(testPrivateKey);

// poll.broadcast(account)
//     .subscribe((broadcastedPoll) => {
//         console.log(broadcastedPoll);
//     });

export * from "./src/poll";
export * from "./src/constants";
