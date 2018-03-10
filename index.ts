import { Address, NEMLibrary, NetworkTypes } from "nem-library";
NEMLibrary.bootstrap(NetworkTypes.MAIN_NET);

import { Poll, BroadcastedPoll } from "./src/Poll";
import { getWhitelistResults, getPOIResults } from "./src/counting";

const pollAddress = new Address("NCVOJQKQU7VWSJL3NEQTG774VPLYKQKI45RNQ4VR");
BroadcastedPoll.fromAddress(pollAddress)
    .switchMap((poll) => {
        console.log("details:", poll);
        return getPOIResults(poll);
    })
    .subscribe((results) => {
        console.log("results:", results);
    });
