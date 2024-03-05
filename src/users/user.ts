import bodyParser from "body-parser";
import express from "express";
import { BASE_USER_PORT,REGISTRY_PORT,  BASE_ONION_ROUTER_PORT} from "../config";
import { Node } from "../registry/registry";
import { rsaEncrypt, createRandomSymmetricKey, exportSymKey, symEncrypt } from "../crypto";

export type SendMessageBody = {
  message: string;
  destinationUserId: number;
};

export async function user(userId: number) {
  const _user = express();
  _user.use(express.json());
  _user.use(bodyParser.json());

  let lastReceivedMessage: string | null = null;
  let lastSentMessage: string | null = null;
  let lastCircuit: Node[] = [];

  _user.get("/getLastReceivedMessage", (req, res) => {
    res.json({ result: lastReceivedMessage });
  });

  _user.get("/getLastSentMessage", (req, res) => {
    res.json({ result: lastSentMessage });
  });

  _user.post("/message", (req, res) => {
    const { message } = req.body;
  
    lastReceivedMessage = message;
  
    res.status(200).send("success");
  });

  // TODO implement the status route
  _user.get("/status", (req, res) => {
    res.send("live");
  });

  _user.post("/sendMessage", async (req, res) => {
    const { message, destinationUserId } = req.body;
    let circuit: Node[] = [];

    // create a random circuit of 3 distinct nodes with the help of the node registry
    // get the node registry
    const nodes = await fetch(`http://localhost:${REGISTRY_PORT}/getNodeRegistry`)
      .then((res) => res.json())
      .then((body: any) => body.nodes);

    // pick 3 random different nodes
    while (circuit.length < 3) {
      const randomIndex = Math.floor(Math.random() * nodes.length);
      if (!circuit.includes(nodes[randomIndex])) {
        circuit.push(nodes[randomIndex]);
      }
    }

    lastSentMessage = message;
    let messageToSend = lastSentMessage;
    let destination = `${BASE_USER_PORT + destinationUserId}`.padStart(10, "0");
    
    for (let i = 0; i < circuit.length; i++) {
      const node = circuit[i];
      
      const symKey = await createRandomSymmetricKey();
      
      const messageToEncrypt = `${destination + messageToSend}`;
      
      destination = `${BASE_ONION_ROUTER_PORT + node.nodeId}`.padStart(10, "0");
      const encryptedMessage = await symEncrypt(symKey, messageToEncrypt);
      
      const encryptedSymKey = await rsaEncrypt(await exportSymKey(symKey), node.pubKey);
      messageToSend = encryptedSymKey + encryptedMessage;
    }

    // reverse the circuit
    circuit.reverse();

    // forward the encrypted message to the entry node
    const entryNode = circuit[0];
    lastCircuit = circuit;
    await fetch(`http://localhost:${BASE_ONION_ROUTER_PORT + entryNode.nodeId}/message`, {
      method: "POST",
      body: JSON.stringify({ message: messageToSend }),
      headers: {
        "Content-Type": "application/json",
      },
    });

    res.send("success");
  });

  // /getLastCircuit
  _user.get("/getLastCircuit", (req, res) => {
    // return only the nodeId of each node in the circuit
    res.json({ result: lastCircuit.map((node) => node.nodeId) });
  });


  const server = _user.listen(BASE_USER_PORT + userId, () => {
    console.log(
      `User ${userId} is listening on port ${BASE_USER_PORT + userId}`
    );
  });

  return server;
}