# NEM Voting

[![npm version](https://badge.fury.io/js/nem-voting.svg)](https://badge.fury.io/js/nem-voting)
[![Build Status](https://travis-ci.org/shierve/nem-voting.svg?branch=master)](https://travis-ci.org/shierve/nem-voting)
[![Coverage Status](https://coveralls.io/repos/github/shierve/nem-voting/badge.svg?branch=master)](https://coveralls.io/github/shierve/nem-voting?branch=master)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

nem-voting is a typescript / node.js module for using the NEM voting functionalities easily on any project. Created using NEM-library.

1. [Installation](#installation)
2. [Examples](#examples)
3. [Definitions](#definitions)
4. [Technical specification](#specification)

## Installation <a name="installation"></a>

to install the npm module on your typescript or node project run:

`npm install nem-voting --save`

the module is made to work together with nem-library, so you should install that too:

`npm install nem-library@1.0.5 --save`

it is important that 1.0.5 is installed since it needs to be the same version than the one in nem-voting

## Examples <a name="examples"></a>

The module exports two main classes: UnbroadcastedPoll and BroadcastedPoll. They represent polls that exist only locally and polls that exist in the blockchain, respectively.

It also exports a PollConstants object with various usefull constants for voting and a PollIndex object for handling indexes other than the public one (public and private), along with some useful functions specified below.

### Creating and Broadcasting a Poll to the blockchain

```typescript
import { PollConstants, UnbroadcastedPoll, BroadcastedPoll } from "nem-voting";
import { NEMLibrary, NetworkTypes, Account, TransactionHttp } from "nem-library";
import { Observable } from "rxjs";

// This function will bootstrap both the internal nem-library for nem-voting and the local one
// if the local version of nem-library and the one in nem-voting don't match then this will give problems
NEMLibrary.bootstrap(NetworkTypes.TEST_NET); // Change to NetworkTypes.MAIN_NET for main net
const testPrivateKey = "c195d7699662b0e2dfae6a4aef87a082d11f74d2bd583f7dec5663a107823691"; // introduce the poll creator private key

const formData = {
    title: "test poll 2.0",
    doe: Date.now() + (60 * 1000 * 60), // Date of ending as timestamp in milliseconds
    type: PollConstants.POI_POLL, // type of vote counting
    multiple: false, // true if multiple votes are allowed
};
const description = "This is the description for the poll";
const options = ["option 1", "option 2"];

// Create poll object
const poll = new UnbroadcastedPoll(formData, description, options);
const account = Account.createWithPrivateKey(testPrivateKey);

// We get the broadcasted poll data, including the poll address and the option addresses
const broadcastData = poll.broadcast(account.publicKey);
// Now we sign and broadcast the transactions
const transactionHttp = new TransactionHttp();
Observable.merge(...(broadcastData.transactions.map((t) => {
    const signed = account.signTransaction(t);
    return transactionHttp.announceTransaction(signed);
})))
    .last()
    .subscribe(() => {
        // The poll is now broadcasted, but we need to wait for all the transactions to be confirmed
        console.log(broadcastData.broadcastedPoll);
    });

```

### Fetching a Poll from the blockchain

```typescript
import { BroadcastedPoll, NEMVoting } from "nem-voting";
import { NEMLibrary, Address, NetworkTypes } from "nem-library";

// This function will bootstrap both the internal nem-library for nem-voting and the local one
// if the local version of nem-library and the one in nem-voting don't match then this will give problems
NEMLibrary.bootstrap(NetworkTypes.TEST_NET); // Change to NetworkTypes.MAIN_NET for main net
const pollAddress = new Address("TCX6LT3Y43IQL3DKU6FAGDMWJFROQGFPWSJMUY7R");

BroadcastedPoll.fromAddress(pollAddress)
    .map((poll) => {
        console.log(poll);
    })
```

### Getting the results for a broadcasted poll

```typescript
import { BroadcastedPoll, NEMVoting } from "nem-voting";
import { NEMLibrary, Address, NetworkTypes } from "nem-library";

// This function will bootstrap both the internal nem-library for nem-voting and the local one
// if the local version of nem-library and the one in nem-voting don't match then this will give problems
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
import { NEMLibrary, Address, NetworkTypes, Account, TransactionHttp } from 'nem-library';

// This function will bootstrap both the internal nem-library for nem-voting and the local one
// if the local version of nem-library and the one in nem-voting don't match then this will give problems
NEMLibrary.bootstrap(NetworkTypes.TEST_NET); // Change to NetworkTypes.MAIN_NET for main net
const pollAddress = new Address("TBW2PIAVJPW7QRHWJ74PA4E36B6FNE7QWGOI3JAF"); // Poll Address
const testPrivateKey = "c195d7699662b0e2dfae6a4aef87a082d11f74d2bd583f7dec5663a107823691"; // Voter private key
const account = Account.createWithPrivateKey(testPrivateKey);

BroadcastedPoll.fromAddress(pollAddress)
    .switchMap((poll) => {
        // It is important to validate that a poll is valid before voting
        if (!poll.validate()) {
            throw new Error("Invalid Poll");
        }
        const voteTransaction = poll.vote(poll.data.options[0]); // get vote transaction
        const signed = account.signTransaction(voteTransaction); // sign transaction
        const transactionHttp = new TransactionHttp();
        return transactionHttp.announceTransaction(signed); // broadcast transaction
    })
    .subscribe((announceResult) => {
        console.log(announceResult);
    });
```

## Definitions <a name="definitions"></a>

### UnbroadcastedPoll

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
interface IBroadcastData {
    /**
     * Transactions that need to be sent and confirmed for the poll to be broadcasted
     */
    transactions: TransferTransaction[];
    /**
     * Broadcasted Poll object. Can not be used until the transactions have been broadcasted and confirmed
     */
    broadcastedPoll: BroadcastedPoll;
}
/**
 * Abstract class that represents a poll
 */
declare abstract class Poll {
    readonly data: IPollData;
}
/**
 * An unbroadcasted poll. Exists only locally and not on the blockchain yet
 */
declare class UnbroadcastedPoll extends Poll {
    constructor(formData: IFormData, description: string, options: string[], whitelist?: Address[]);
    /**
     * Broadcasts an unbroadcasted poll and returns the resulting broadcasted poll object (as a promise)
     * @param creatorPublicKey - public key of the poll creator
     * @param pollIndex - optionally provide the poll index to send the poll to.
     *                    If not specified the default public index is used
     * @return {pollAddress: Address, transactions: TransferTransaction[]} - returns the poll address
     * and the transactions that need to be sent for it to be broadcasted
     */
    broadcast: (creatorPublicKey: string, pollIndex?: PollIndex | undefined) => IBroadcastData;
}
```

### BroadcastedPoll

```typescript
/**
 * A broadcasted poll. Represents a Poll that exists in the blockchain.
 */
declare class BroadcastedPoll extends Poll {
    /**
     * The poll address
     */
    readonly address: Address;
    /**
     * Map from option to option address
     */
    private optionAddresses;
    /**
     * Fetches a Broadcasted Poll from the blockchain by its address
     * @param pollAddress - The poll's NEM Address
     * @return Promise<BroadcastedPoll>
     */
    private static fromAddressPromise;
    /**
     * Fetches a Broadcasted Poll from the blockchain by its address
     * @param pollAddress - The poll's NEM Address
     * @return Observable<BroadcastedPoll>
     */
    static fromAddress: (pollAddress: Address) => Observable<BroadcastedPoll>;
    /**
     * Gets the option address for a given option
     * @param option - The option
     * @return Address | null
     */
    getOptionAddress: (option: string) => Address | null;
    /**
     * Gets the results for the poll
     * @param pollAddress - The poll's NEM Address
     * @return Observable<IResults>
     */
    getResults: () => Observable<IResults>;
    /**
     * Gets the results for the poll as a csv string
     * @param pollAddress - The poll's NEM Address
     * @return Observable<string>
     */
    getCsvResults: () => Observable<string>;
    /**
     * Gets the results for the poll as an array of vote objects
     * @param pollAddress - The poll's NEM Address
     * @return Observable<IResults>
     */
    getVoters: () => Observable<IVote[]>;
    /**
     * validates a poll's structure and returns wether it is correct or not
     * @return boolean
     */
    validate: () => boolean;
    /**
     * Votes on the poll from a given account, returns the vote transaction result
     * @param option - The option to vote
     * @return TransferTransaction - the transaction that needs to be sent to vote
     */
    vote: (option: string) => TransferTransaction;
    /**
     * Votes on the poll from a multisig account, returns the vote transaction result
     * @param multisigAccount - The public account of the multisig account that votes
     * @param option - The option to vote
     * @return MultisigTransaction - the transaction that needs to be sent to vote
     */
    voteMultisig: (multisigAccount: PublicAccount, option: string) => MultisigTransaction;
    /**
     * Gets the votes that an address has sent to the poll, if it has not voted returns null
     * @param address - The address of the voter
     * @return Observable<Transaction[] | null>
     */
    getVotes: (address: Address) => Observable<Transaction[] | null>;
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

### Poll Indexes

```typescript
/**
 * Represents the info from a poll header sent to an index
 */
interface IPollHeader {
    title: string;
    type: number;
    doe: number;
    address: Address;
    whitelist?: Address[];
}
/**
 * Contains the info for a poll index, public or private
 */
declare class PollIndex {
    /**
     * Poll Index Address
     */
    address: Address;
    /**
     * true if the index is private. On private indexes only the creator can send valid polls
     */
    isPrivate: boolean;
    /**
     * the creator of the poll, only needed for private indexes
     */
    creator?: Address;
    /**
     * array of broadcasted header polls for the index
     */
    headers: IPollHeader[];
    /**
     * Gets a poll index from its address with all of its broadcasted polls
     * @param address - the index account address
     * @return Observable<PollIndex>
     */
    static fromAddress: (address: Address) => Observable<PollIndex>;
    /**
     * Creates a new poll Index
     * @param isPrivate - will create a private index if true
     * @param creatorAddress - needed only if the index is private
     * @return Observable<PollIndex>
     */
    static create: (isPrivate: boolean, creatorAddress?: Address | undefined) => {
        address: Address;
        transaction: TransferTransaction;
    };
}
/**
 * Gets the addresses for all the poll indexes created by an address
 * @param creator - the address of the creator of the indexes we want
 * @return Observable<Address[]>
 */
declare const getCreatedIndexAddresses: (creator: Address) => Observable<Address[]>;
```

## Technical specification <a name="specification"></a>

A Detailed Technical description of the NEM voting Standard is mantained at https://github.com/shierve/NEM-voting-specifications
