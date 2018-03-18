import { Address, NEMLibrary, NetworkTypes, PublicAccount, Account } from "nem-library";
NEMLibrary.bootstrap(NetworkTypes.MAIN_NET);

import { Poll, BroadcastedPoll, UnbroadcastedPoll } from "./src/Poll";
import { getWhitelistResults, getPOIResults, getPOIResultsCsv } from "./src/counting";
import { getHeightByTimestamp, generatePollAddress } from "./src/utils";
import { POI_POLL } from "./src/constants";

const pollAddress = new Address("NALYCSZ5AUN4MZZNPVTPXMAHT7U6RHWIO4AGKYA2");

// const testPrivateKey = "c195d7699662b0e2dfae6a4aef87a082d11f74d2bd583f7dec5663a107823691";

BroadcastedPoll.fromAddress(pollAddress)
    .switchMap((poll) => {
        // console.log("details:", poll);
        return getPOIResultsCsv(poll);
    })
    .subscribe((results) => {
        console.log(results);
    });

// const formData = {
//     title: "this time for real",
//     doe: Date.now() + (60 * 1000 * 60),
//     type: POI_POLL,
//     multiple: false,
// };
// const description = "This is the first poll broadcasted from the new npm module for voting! :)";
// const options = ["this is awesome", "this is super awesome"];

// const poll = new UnbroadcastedPoll(formData, description, options);
// const account = Account.createWithPrivateKey(testPrivateKey);

// poll.broadcast(account)
//     .subscribe((broadcastedPoll) => {
//         console.log(broadcastedPoll);
//     });
