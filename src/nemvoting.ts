import { NEMLibrary, NetworkTypes } from "nem-library";

const NEMVoting = {
    bootstrap: (network: NetworkTypes) => {
        NEMLibrary.bootstrap(network);
    },
};

export { NEMVoting };
