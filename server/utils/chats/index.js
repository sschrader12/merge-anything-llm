const { v4: uuidv4 } = require("uuid");
const { WorkspaceChats } = require("../../models/workspaceChats");
const { resetMemory } = require("./commands/reset");
const { convertToPromptHistory } = require("../helpers/chat/responses");
const { SlashCommandPresets } = require("../../models/slashCommandsPresets");
const { SystemPromptVariables } = require("../../models/systemPromptVariables");

const VALID_COMMANDS = {
  "/reset": resetMemory,
};

async function grepCommand(message, user = null) {
  const userPresets = await SlashCommandPresets.getUserPresets(user?.id);
  const availableCommands = Object.keys(VALID_COMMANDS);

  // Check if the message starts with any built-in command
  for (let i = 0; i < availableCommands.length; i++) {
    const cmd = availableCommands[i];
    const re = new RegExp(`^(${cmd})`, "i");
    if (re.test(message)) {
      return cmd;
    }
  }

  // Replace all preset commands with their corresponding prompts
  // Allows multiple commands in one message
  let updatedMessage = message;
  for (const preset of userPresets) {
    const regex = new RegExp(
      `(?:\\b\\s|^)(${preset.command})(?:\\b\\s|$)`,
      "g"
    );
    updatedMessage = updatedMessage.replace(regex, preset.prompt);
  }

  return updatedMessage;
}

/**
 * @description This function will do recursive replacement of all slash commands with their corresponding prompts.
 * @notice This function is used for API calls and is not user-scoped. THIS FUNCTION DOES NOT SUPPORT PRESET COMMANDS.
 * @returns {Promise<string>}
 */
async function grepAllSlashCommands(message) {
  const allPresets = await SlashCommandPresets.where({});

  // Replace all preset commands with their corresponding prompts
  // Allows multiple commands in one message
  let updatedMessage = message;
  for (const preset of allPresets) {
    const regex = new RegExp(
      `(?:\\b\\s|^)(${preset.command})(?:\\b\\s|$)`,
      "g"
    );
    updatedMessage = updatedMessage.replace(regex, preset.prompt);
  }

  return updatedMessage;
}

async function recentChatHistory({
  user = null,
  workspace,
  thread = null,
  messageLimit = 20,
  apiSessionId = null,
}) {
  const rawHistory = (
    await WorkspaceChats.where(
      {
        workspaceId: workspace.id,
        user_id: user?.id || null,
        thread_id: thread?.id || null,
        api_session_id: apiSessionId || null,
        include: true,
      },
      messageLimit,
      { id: "desc" }
    )
  ).reverse();
  return { rawHistory, chatHistory: convertToPromptHistory(rawHistory) };
}

/**
 * Returns the base prompt for the chat. This method will also do variable
 * substitution on the prompt if there are any defined variables in the prompt.
 * @param {Object|null} workspace - the workspace object
 * @param {Object|null} user - the user object
 * @returns {Promise<string>} - the base prompt
 */
async function chatPrompt(workspace, user = null) {
  const basePrompt =
    workspace?.openAiPrompt ??
    "Given the following conversation, relevant context, and a follow up question, reply with an answer to the current question the user is asking. Return only your response to the question given the above information following the users instructions as needed.";
  
  // Add provider-specific identity information to prevent model confusion
  const providerIdentity = getProviderIdentity(workspace?.chatProvider);
  const fullPrompt = providerIdentity ? `${providerIdentity}\n\n${basePrompt}` : basePrompt;
  
  return await SystemPromptVariables.expandSystemPromptVariables(
    fullPrompt,
    user?.id
  );
}

/**
 * Returns provider-specific identity text to help the model understand what it is
 * @param {string|null} provider - the chat provider being used
 * @returns {string|null} - the provider identity text or null for generic providers
 */
function getProviderIdentity(provider) {
  switch (provider) {
    case "anthropic":
      return "You are Claude, an AI assistant created by Anthropic.";
    case "groq":
      return "You are a helpful AI assistant powered by Groq's fast inference technology.";
    case "openai":
      return "You are ChatGPT, a helpful AI assistant created by OpenAI.";
    case "gemini":
      return "You are Gemini, a helpful AI assistant created by Google.";
    case "mistral":
      return "You are a helpful AI assistant powered by Mistral AI.";
    case "cohere":
      return "You are a helpful AI assistant powered by Cohere.";
    case "perplexity":
      return "You are a helpful AI assistant powered by Perplexity.";
    case "huggingface":
      return "You are a helpful AI assistant powered by Hugging Face.";
    case "togetherai":
      return "You are a helpful AI assistant powered by Together AI.";
    case "fireworksai":
      return "You are a helpful AI assistant powered by Fireworks AI.";
    case "openrouter":
      return "You are a helpful AI assistant powered by OpenRouter.";
    case "bedrock":
      return "You are a helpful AI assistant powered by Amazon Bedrock.";
    case "azure":
      return "You are a helpful AI assistant powered by Azure OpenAI.";
    case "deepseek":
      return "You are a helpful AI assistant powered by DeepSeek.";
    case "xai":
      return "You are Grok, a helpful AI assistant created by xAI.";
    default:
      // For local providers or unknown providers, don't add specific identity
      return null;
  }
}

// We use this util function to deduplicate sources from similarity searching
// if the document is already pinned.
// Eg: You pin a csv, if we RAG + full-text that you will get the same data
// points both in the full-text and possibly from RAG - result in bad results
// even if the LLM was not even going to hallucinate.
function sourceIdentifier(sourceDocument) {
  if (!sourceDocument?.title || !sourceDocument?.published) return uuidv4();
  return `title:${sourceDocument.title}-timestamp:${sourceDocument.published}`;
}

module.exports = {
  sourceIdentifier,
  recentChatHistory,
  chatPrompt,
  getProviderIdentity,
  grepCommand,
  grepAllSlashCommands,
  VALID_COMMANDS,
};
