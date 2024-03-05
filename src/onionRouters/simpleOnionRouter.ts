import bodyParser from "body-parser";
import express from "express";
import { BASE_ONION_ROUTER_PORT, REGISTRY_PORT } from "../config";
import { generateRsaKeyPair, exportPrvKey, exportPubKey, symDecrypt, rsaDecrypt, importSymKey, importPrvKey } from '../crypto';
import http, { IncomingMessage, RequestOptions } from "http";
import { GetNodeRegistryBody } from "../registry/registry";


//define variables for the GET
let lastReceivedEncryptedMessage: string | null = null;
let lastReceivedDecryptedMessage: string | null = null;
let lastMessageDestination: number | null = null;
//private key variable for its get - not used in real scenarios
let privateKey: string | null = null;
let publicKey: string | null = null;
let privateKeyMap: { [key: number]: string } = {};

//define type for message body
type MessageBody = {
  encryptedMessage: string;
};

export async function simpleOnionRouter(nodeId: number) {
  const onionRouter = express();
  onionRouter.use(express.json());
  onionRouter.use(bodyParser.json());

  //implement the status route
  onionRouter.get("/status", (req, res) => { res.send("live");});

  // Register node on startup
  try {
    const { privateKey: generatedPrivateKey, publicKey: generatedPublicKey } = await generateRsaKeyPair(); // Generate key pair

    privateKey = await exportPrvKey(generatedPrivateKey);
    publicKey = await exportPubKey(generatedPublicKey)

    // Define the data to be sent in the POST request
    const postData = JSON.stringify({
      nodeId,
      pubKey: publicKey
    });

    // Define the options for the POST request
    const options = {
      hostname: "localhost",
      port: REGISTRY_PORT,
      path: "/registerNode",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": postData.length
      }
    };
    // Create the HTTP POST request
    const httpRequest = http.request(options, (response) => {
      console.log(`Node ${nodeId} registered successfully.`);
    });
    // Handle errors in the HTTP request
    httpRequest.on("error", (error) => {
      console.error(`Error registering node ${nodeId} on startup:`, error);
    });
    // Send the POST request with the data
    httpRequest.write(postData);
    httpRequest.end();
  } catch (error) {
    console.error(`Error registering node ${nodeId} on startup:`, error);
  }
// Implement the HTTP POST route for receiving messages
onionRouter.post("/message", async (req, res) => {
  try {
    const { encryptedMessage }: MessageBody = req.body;

    // Check if privateKey is not null before using it
    if (privateKey !== null) {
      //separate the key from the rest
      const [encryptedSymmetricKey, encryptedLayer1] = [
        encryptedMessage.slice(0, 44), //length of symmetric key
        encryptedMessage.slice(44)
      ];
      
      const decryptedSymmetricKey = await rsaDecrypt(encryptedSymmetricKey, await importPrvKey(privateKey));

      const decryptedMessageWithDestination = await symDecrypt(decryptedSymmetricKey, encryptedLayer1);

      const decryptedMessage = decryptedMessageWithDestination.slice(0, -10);
      const destination = decryptedMessageWithDestination.slice(-10);

      if (destination) {
        // Transfer the message to the next node
        const postData = JSON.stringify({ encryptedMessage });
        const options: RequestOptions = {
          hostname: "localhost",
          port: destination, // Port of the next node or user
          path: "/message",
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(postData)
          }
        };

        const httpRequest = http.request(options, (response: IncomingMessage) => {
          // Handle response from the next node or user
          res.json({ message: "Message forwarded successfully." });
        });

        httpRequest.on("error", (error) => {
          console.error("Error sending HTTP request:", error);
          res.status(500).json({ error: "Internal server error." });
        });

        // Send the POST request with the message in the body
        httpRequest.write(postData);
        httpRequest.end();
      } else {
        // If the message has reached the end of the circuit, send it to the destination user
        // Implement logic to send the decrypted message to the destination user
        res.json({ message: "Message delivered to destination user." });
      }
    } else {
      // Handle the case where privateKey is null
      console.error("Private key is null.");
      res.status(500).json({ error: "Private key is null." });
    }
  } catch (error) {
    console.error("Error processing message:", error);
    res.status(500).json({ error: "Internal server error." });
  }
});


  //implement the GET routes for testing
  //GET last encrypted message
  onionRouter.get("/getLastReceivedEncryptedMessage", (req, res) => {
    res.json({ result: lastReceivedEncryptedMessage });
  });
  //GET last decrypted message
  onionRouter.get("/getLastReceivedDecryptedMessage", (req, res) => {
    res.json({ result: lastReceivedDecryptedMessage });
  });
  //GET last destination
  onionRouter.get("/getLastMessageDestination", (req, res) => {
    res.json({ result: lastMessageDestination });
  });

  //GET private key
  //GET private key
onionRouter.get("/getPrivateKey", (req, res) => {
  if (privateKey !== null) {
    res.json({ result: privateKey });
  } else {
    // If privateKey is null, generate a new key pair and return the private key
    generateRsaKeyPair().then(async ({ privateKey: generatedPrivateKey }) => {
      privateKey = await exportPrvKey(generatedPrivateKey);
      res.json({ result: privateKey });
    }).catch(error => {
      console.error("Error generating private key:", error);
      res.status(500).json({ error: "Error generating private key." });
    });
  }
});

  

  const server = onionRouter.listen(BASE_ONION_ROUTER_PORT + nodeId, () => {
    console.log(
      `Onion router ${nodeId} is listening on port ${
        BASE_ONION_ROUTER_PORT + nodeId
      }`
    );
  });


  


  return server;
}