# NEM Voting

[![npm version](https://badge.fury.io/js/nem-voting.svg)](https://badge.fury.io/js/nem-voting)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

nem-voting is a typescript / node.js module for using the NEM voting functionalities easily on any project. Created using NEM-library.

## Installation

to install the npm module on your typescript or node project run:

`npm install nem-voting --save`

## Usage

The module contains two main classes: UnbroadcastedPoll and BroadcastedPoll. They represent polls that exist only locally and polls that exist in the blockchain, respectively.

### Creating and Broadcasting a Poll to the blockchain

```typescript
import { PollConstants, UnbroadcastedPoll, BroadcastedPoll } from "nem-voting";
import { NEMLibrary, NetworkTypes, Account } from "nem-library";

NEMLibrary.bootstrap(NetworkTypes.TEST_NET); // Change to NetworkTypes.MAIN_NET for main net
const testPrivateKey = ""; // introduce the poll creator private key

const formData = {
    title: "test poll",
    doe: Date.now() + (60 * 1000 * 60), // Date of ending as timestamp in milliseconds
    type: PollConstants.POI_POLL, // type of vote counting
    multiple: false, // true if multiple votes are allowed
};
const description = "This is the description for the poll";
const options = ["option 1", "option 2"];

const poll = new UnbroadcastedPoll(formData, description, options);
const account = Account.createWithPrivateKey(testPrivateKey);

poll.broadcast(account)
    .subscribe((broadcastedPoll) => {
        console.log(broadcastedPoll); // We get the broadcasted poll data, including the poll address and the option addresses
    });
```

### Fetching a Poll from the blockchain and getting results

```typescript
import { BroadcastedPoll } from "nem-voting";
import { NEMLibrary, Address, NetworkTypes } from "nem-library";

NEMLibrary.bootstrap(NetworkTypes.TEST_NET); // Change to NetworkTypes.MAIN_NET for main net
const pollAddress = new Address("TCX6LT3Y43IQL3DKU6FAGDMWJFROQGFPWSJMUY7R");

BroadcastedPoll.fromAddress(pollAddress)
    .switchMap((poll) => {
        console.log("details:", poll);
        return poll.getResults();
    })
    .subscribe((results) => {
        console.log(results);
    });
```
