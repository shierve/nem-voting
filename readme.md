# NEM Voting

[![npm version](https://badge.fury.io/js/nem-voting.svg)](https://badge.fury.io/js/nem-voting)
[![Build Status](https://travis-ci.org/shierve/nem-voting.svg?branch=master)](https://travis-ci.org/shierve/nem-voting)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

nem-voting is a typescript / node.js module for using the NEM voting functionalities easily on any project. Created using NEM-library.

1. [Installation](#installation)
2. [Examples](#examples)
3. [Definitions](#definitions)
4. [Technical specification](#specification)

## Installation <a name="installation"></a>

to install the npm module on your typescript or node project run:

`npm install nem-voting --save`

## Examples <a name="examples"></a>

The module exports two main classes: UnbroadcastedPoll and BroadcastedPoll. They represent polls that exist only locally and polls that exist in the blockchain, respectively.

It also exports a PollConstants object with various usefull constants for voting.

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

### Fetching a Poll from the blockchain

```typescript
import { BroadcastedPoll } from "nem-voting";
import { NEMLibrary, Address, NetworkTypes } from "nem-library";

NEMLibrary.bootstrap(NetworkTypes.TEST_NET); // Change to NetworkTypes.MAIN_NET for main net
const pollAddress = new Address("TCX6LT3Y43IQL3DKU6FAGDMWJFROQGFPWSJMUY7R");

BroadcastedPoll.fromAddress(pollAddress)
    .map((poll) => {
        console.log(poll);
    })
```

### Getting the results for a broadcasted poll

```typescript
import { BroadcastedPoll } from "nem-voting";
import { NEMLibrary, Address, NetworkTypes } from "nem-library";

NEMLibrary.bootstrap(NetworkTypes.TEST_NET); // Change to NetworkTypes.MAIN_NET for main net
const pollAddress = new Address("TCX6LT3Y43IQL3DKU6FAGDMWJFROQGFPWSJMUY7R");

BroadcastedPoll.fromAddress(pollAddress)
    .switchMap((poll) => {
        return poll.getResults();
    })
    .subscribe((results) => {
        console.log(results);
    });
```

### Voting on a poll

```typescript
import { BroadcastedPoll } from "nem-voting";
import { NEMLibrary, Address, NetworkTypes, Account } from 'nem-library';

NEMLibrary.bootstrap(NetworkTypes.TEST_NET); // Change to NetworkTypes.MAIN_NET for main net
const pollAddress = new Address("TCX6LT3Y43IQL3DKU6FAGDMWJFROQGFPWSJMUY7R"); // Poll Address
const testPrivateKey = ""; // Voter private key
const account = Account.createWithPrivateKey(testPrivateKey);

BroadcastedPoll.fromAddress(pollAddress)
    .switchMap((poll) => {
        // It is important to validate that a poll is valid before voting
        if (!poll.validate()) {
            throw new Error("Invalid Poll");
        }
        return poll.vote(account, poll.data.options[0]); // vote
    })
    .subscribe((announceResult) => {
        console.log(announceResult);
    });
```

## Definitions <a name="definitions"></a>

### UnbroadcastedPoll

```typescript
/**
 * An unbroadcasted poll. Exists only locally and not on the blockchain yet
 */
class UnbroadcastedPoll extends Poll {
    constructor(formData: IFormData, description: string, options: string[], whitelist?: Address[]);

    /**
     * Broadcasts an unbroadcasted poll and returns the resulting broadcasted poll object (as a promise)
     * @param account - NEM Account that will broadcast the poll
     * @return Promise<BroadcastedPoll>
     */
    private broadcastPromise = async (account: Account): Promise<BroadcastedPoll>;

    /**
     * Broadcasts an unbroadcasted poll and returns the resulting broadcasted poll object as an Observable
     * @param account - NEM Account that will broadcast the poll
     * @return Observable<BroadcastedPoll>
     */
    public broadcast = (account: Account): Observable<BroadcastedPoll>;
}
```

### BroadcastedPoll

```typescript
interface IFormData {
    /**
     * Title of the poll
     */
    title: string;
    /**
     * date of ending, as milliseconds from UNIX epoch
     */
    doe: number;
    /**
     * True if multiple votes are accepted
     */
    multiple: boolean;
    /**
     * type of the poll
     */
    type: number;
}

interface IPollData {
    /**
     * General information abount the poll
     */
    formData: IFormData;
    /**
     * Detailed description for the poll
     */
    description: string;
    /**
     * Options of the poll
     */
    options: string[];
    /**
     * (optional) Array of Addresses to be whitelisted. Only for whitelist polls
     */
    whitelist?: Address[];
}

/**
 * Maps strings to  addresses, one for each poll option
 */
interface IAddressLink {
    [key: string]: Address;
}

/**
 * A broadcasted poll. Exists in the blockchain
 */
class BroadcastedPoll extends Poll {
    /**
     * The poll address
     */
    public readonly address: Address;
    /**
     * Map from option to option address
     */
    private optionAddresses: IAddressLink;

    constructor(formData: IFormData, description: string, options: string[], pollAddress: Address, optionAddresses: IAddressLink, whitelist?: Address[]);


    /**
     * Fetches a Broadcasted Poll from the blockchain by its address
     * @param pollAddress - The poll's NEM Address
     * @return Observable<BroadcastedPoll>
     */
    public static fromAddress = (pollAddress: Address): Observable<BroadcastedPoll>;

    /**
     * Gets the option address for a given option
     * @param option - The option
     * @return Address | null
     */
    public getOptionAddress = (option: string): Address | null;

    /**
     * Gets the results for the poll
     * @param pollAddress - The poll's NEM Address
     * @return Observable<IResults>
     */
    public getResults = (): Observable<IResults>;

    /**
     * Gets the results for the poll as a csv string
     * @param pollAddress - The poll's NEM Address
     * @return Observable<IResults>
     */
    public getCsvResults = (): Observable<string>;

    /**
     * validates a poll's structure and returns wether it is correct or not
     * @return boolean
     */
    public validate = (): boolean;

    /**
     * Votes on the poll from a given account, returns the vote transaction result
     * @param account - The voter account
     * @param option - The option to vote
     * @return Observable<NemAnnounceResult>
     */
    public vote = (account: Account, option: string): Observable<NemAnnounceResult>;

    /**
     * Votes on the poll from a multisig account, returns the vote transaction result
     * @param account - The cosigner account that signs the multisig transaction
     * @param multisigAccount - The public account of the multisig account that votes
     * @param option - The option to vote
     * @return Observable<NemAnnounceResult>
     */
    public voteMultisig = (account: Account, multisigAccount: PublicAccount, option: string): Observable<NemAnnounceResult>;

    /**
     * Gets the votes that an address has sent to the poll, if it has not voted returns null
     * @param address - The address of the voter
     * @return Observable<Transaction[] | null>
     */
    public getVotes = (address: Address): Observable<Transaction[] | null>;
}
```

### Constants

```typescript
export const PollConstants = {
    /**
     * Poll Types
     */
    POI_POLL: 0,
    WHITELIST_POLL: 1,

    /**
     * Poll Indexes
     */
    TESTNET_POLL_INDEX: "TAVGTNCVGALLUPZC4JTLKR2WX25RQM2QOK5BHBKC",
    MAINNET_POLL_INDEX: "NAZN26HYB7C5HVYVJ4SL3KBTDT773NZBAOMGRFZB",
};
```

## Technical specification <a name="specification"></a>

A Detailed Technical description of the NEM voting Standard is mantained at https://github.com/shierve/NEM-voting-specifications
