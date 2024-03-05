import bodyParser from "body-parser";
import express, { Request, Response } from "express";
import { REGISTRY_PORT } from "../config";


export type Node = { nodeId: number; pubKey: string };

export type RegisterNodeBody = {
  nodeId: number;
  pubKey: string;
};

export type GetNodeRegistryBody = {
  nodes: Node[];
};



//initialise node registry
let nodeRegistry: Node[] = [];

export async function launchRegistry() {
  const _registry = express();
  _registry.use(express.json());
  _registry.use(bodyParser.json());

  //implement the status route
  _registry.get("/status", (req, res) => {res.send("live");});

  //node registering route
  _registry.post("/registerNode", (req: Request<{}, {}, RegisterNodeBody>, res: Response) => {
    const { nodeId, pubKey } = req.body;
    // Check if the node already exists in the registry
    const existingNode = nodeRegistry.find(node => node.nodeId === nodeId);
    if (existingNode) {
      return res.status(400).json({ error: "Node already registered." });
    }
    // Add the new node to the registry
    nodeRegistry.push({ nodeId, pubKey });
    return res.status(201).json({ message: "Node registered successfully." });
  });

  //node get route
  _registry.get("/getNodeRegistry", (req: Request<{}, {}, null, GetNodeRegistryBody>, res: Response<GetNodeRegistryBody>) => {
      // Respond with the node registry
      const payload: GetNodeRegistryBody = { nodes: nodeRegistry };
      res.json(payload);
  });
    
  const server = _registry.listen(REGISTRY_PORT, () => {
    console.log(`registry is listening on port ${REGISTRY_PORT}`);
  });

  return server;
}