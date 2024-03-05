import bodyParser from "body-parser";
import express from "express";
import http, { ClientRequest, RequestOptions } from "http";
import { BASE_USER_PORT, REGISTRY_PORT, BASE_ONION_ROUTER_PORT } from "../config";
import { importPubKey, symEncrypt, rsaEncrypt, createRandomSymmetricKey, exportSymKey } from "../crypto";
import { GetNodeRegistryBody } from "../registry/registry";

//define variables for the GET
let lastReceivedMessage: string | null = null;
let lastSentMessage: string | null = null;

export type SendMessageBody = {
  message: string;
  destinationUserId: number;
};

export async function user(userId: number) {
  const _user = express();
  _user.use(express.json());
  _user.use(bodyParser.json());

   // POST route for sending a message
   _user.post("/sendMessage", async (req, res) => {
    try {
      const { message, destinationUserId }: SendMessageBody = req.body;

      // Fetching a random circuit of 3 distinct nodes from the node registry
      const requestParams: RequestOptions = {
        hostname: "localhost",
        port: REGISTRY_PORT,
        path: "/getNodeRegistry",
        method: "GET"
      };

      const getRequest = http.request(requestParams, async (getResponse) => {
        let responseData = '';
        getResponse.on('data', (chunk) => {
          responseData += chunk;
        });

        getResponse.on('end', async () => {
          const { nodes }: GetNodeRegistryBody = JSON.parse(responseData);
          // Shuffle the nodes randomly
          const shuffledNodes = nodes.sort(() => Math.random() - 0.5);

          // Select the first three nodes from the shuffled list
          const circuit = shuffledNodes.slice(0, 3);

          // Creating a unique symmetric key for each node in the circuit
          const symmetricKeys = await Promise.all(circuit.map(() => createRandomSymmetricKey()));

          // Creating each layer of encryption for the message
          let encryptedMessage = message;
          for (let i = 0; i < circuit.length; i++) {
            const node = circuit[i];
            const destination = i === circuit.length - 1 ? (BASE_USER_PORT + destinationUserId).toString().padStart(10, '0') : (BASE_ONION_ROUTER_PORT + circuit[i + 1].nodeId).toString().padStart(10, '0');
            

            // (1) Concatenate previous value and the message and encrypt with symmetric key
            const encryptedLayer1 = await symEncrypt(symmetricKeys[i], encryptedMessage + destination);

            // (2) Encrypt the symmetric key with the node's RSA public key
            const encryptedSymmetricKey = await rsaEncrypt(await exportSymKey(symmetricKeys[i]), node.pubKey);

            // Concatenate (1) and (2)
            encryptedMessage = encryptedSymmetricKey + encryptedLayer1;
          }

          // Forwarding the encrypted message to the entry node's /message route
          const entryNode = circuit[0];
          const postData = JSON.stringify({ encryptedMessage });
          const postRequestParams: RequestOptions = {
            hostname: "localhost",
            port: entryNode.nodeId,
            path: "/message",
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Content-Length": Buffer.byteLength(postData)
            }
          };

          const postRequest = http.request(postRequestParams, (postResponse) => {
            // Handle response from the entry node
            res.json({ message: "Message sent successfully." });
          });

          postRequest.on('error', (error) => {
            console.error("Error sending POST request:", error);
            res.status(500).json({ error: "Internal server error." });
          });

          // Send the POST request with the encrypted message in the body
          postRequest.write(postData);
          postRequest.end();
        });
      });

      getRequest.on('error', (error) => {
        console.error("Error sending GET request:", error);
        res.status(500).json({ error: "Internal server error." });
      });

      getRequest.end();
    } catch (error) {
      console.error("Error sending message:", error);
      res.status(500).json({ error: "Internal server error." });
    }
  });

  //implement the status route
  _user.get("/status", (req, res) => {res.send("live");});

  //POST message route
  _user.post("/message", (req, res) => {
    const { message }: { message: string } = req.body;
    //update lastReceivedMessage
    lastReceivedMessage = message;
    //message recieved
    res.send("success");
  });


  //implement GET routes
  _user.get("/getLastReceivedMessage", (req, res) => {
    res.json({ result: lastReceivedMessage });
  });

  _user.get("/getLastSentMessage", (req, res) => {
    res.json({ result: lastSentMessage });
  });

  const server = _user.listen(BASE_USER_PORT + userId, () => {
    console.log(
      `User ${userId} is listening on port ${BASE_USER_PORT + userId}`
    );
  });

  return server;
}