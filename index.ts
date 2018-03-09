import {Poll, BroadcastedPoll} from "./src/Poll";
import { Address, NEMLibrary, NetworkTypes } from "nem-library";

// NEMLibrary.bootstrap(NetworkTypes.MAIN_NET);

const pollAddress = new Address("NBDK5MNPM7G72GYFN3QXYYKQMFXD4YTYJAGMQXUG");
BroadcastedPoll.fromAddress(pollAddress)
    .subscribe((poll) => {
        console.log(poll);
    });
