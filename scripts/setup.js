import { execSync } from "child_process";
import { copyFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import net from "net";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, "..");

console.log("=========================================");
console.log("        BraveMCP Setup Orchestrator      ");
console.log("=========================================\n");

// 1. Check Node.js Version
const nodeVersion = process.versions.node;
const majorVersion = parseInt(nodeVersion.split(".")[0], 10);
if (majorVersion < 18) {
  console.error(`❌ Error: Node.js version ${nodeVersion} detected. Node.js >= 18 is required.`);
  process.exit(1);
}
console.log(`✅ Node.js version check passed: v${nodeVersion}`);

// 2. Install dependencies in mcp-server/
console.log("\n📦 Installing dependencies in mcp-server...");
try {
  execSync("npm install", { cwd: join(projectRoot, "mcp-server"), stdio: "inherit" });
  console.log("✅ Dependencies installed successfully.");
} catch (error) {
  console.error("❌ Failed to install dependencies in mcp-server.");
  process.exit(1);
}

// 3. Build mcp-server/
console.log("\n🛠️ Compiling typescript files in mcp-server...");
try {
  execSync("npm run build", { cwd: join(projectRoot, "mcp-server"), stdio: "inherit" });
  console.log("✅ TypeScript compilation finished successfully.");
} catch (error) {
  console.error("❌ TypeScript build failed.");
  process.exit(1);
}

// 4. Setup .env file
console.log("\n⚙️ Checking configuration files...");
const envPath = join(projectRoot, ".env");
const envExamplePath = join(projectRoot, ".env.example");
if (!existsSync(envPath)) {
  if (existsSync(envExamplePath)) {
    copyFileSync(envExamplePath, envPath);
    console.log("✅ Created .env file from template (.env.example).");
  } else {
    console.warn("⚠️ Warning: .env.example not found. Please manually configure your .env file.");
  }
} else {
  console.log("✅ Existing .env file detected.");
}

// 5. Helper to check port connectivity
function checkPort(port, host = "127.0.0.1") {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    const onError = () => {
      socket.destroy();
      resolve(false);
    };
    socket.setTimeout(1500);
    socket.once("error", onError);
    socket.once("timeout", onError);
    socket.connect(port, host, () => {
      socket.end();
      resolve(true);
    });
  });
}

// 6. Report status of local servers
async function checkServices() {
  console.log("\n🔍 Checking local service availability...");
  const isChromaRunning = await checkPort(8000);
  const isMcpHttpRunning = await checkPort(3747);

  if (isChromaRunning) {
    console.log("🟢 ChromaDB: Detected running on port 8000.");
  } else {
    console.log("🔴 ChromaDB: Not detected on port 8000. Start it with: npm run chroma");
  }

  if (isMcpHttpRunning) {
    console.log("🟢 BraveMCP HTTP Bridge: Detected running on port 3747.");
  } else {
    console.log("ℹ️ BraveMCP HTTP Bridge: Port 3747 is free (will run when server starts).");
  }

  console.log("\n=========================================");
  console.log(" 🎉 SETUP COMPLETED SUCCESSFULLY!        ");
  console.log("=========================================\n");
  console.log("Next steps to get started:");
  console.log("1. Add BraveMCP to Claude Desktop config:");
  console.log("   Open %APPDATA%\\Claude\\claude_desktop_config.json and add:");
  console.log("   {");
  console.log("     \"mcpServers\": {");
  console.log("       \"brave-memory\": {");
  console.log("         \"command\": \"node\",");
  console.log("         \"args\": [\"" + join(projectRoot, "mcp-server", "dist", "index.js").replace(/\\/g, "/") + "\"]");
  console.log("       }");
  console.log("     }");
  console.log("   }");
  console.log("\n2. Start local ChromaDB vector database:");
  console.log("   npm run chroma");
  console.log("\n3. Load the browser extension:");
  console.log("   - Open Brave or Chrome at chrome://extensions/");
  console.log("   - Toggle 'Developer mode' on.");
  console.log("   - Click 'Load unpacked' and select the 'extension' directory.");
  console.log("=========================================");
}

checkServices();
