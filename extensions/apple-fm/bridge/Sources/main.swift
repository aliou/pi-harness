import Foundation
import FoundationModels

// MARK: - Request Types

struct BridgeRequest: Decodable {
    struct Message: Decodable {
        let role: String
        let content: String
    }

    let messages: [Message]
    let temperature: Double?
    let maxTokens: Int?

    enum CodingKeys: String, CodingKey {
        case messages, temperature
        case maxTokens = "max_tokens"
    }
}

// MARK: - Output Helpers

func output(_ dict: [String: Any]) {
    if let data = try? JSONSerialization.data(withJSONObject: dict),
       let str = String(data: data, encoding: .utf8)
    {
        print(str)
        fflush(stdout)
    }
}

func outputError(_ message: String, code: String) {
    output(["type": "error", "message": message, "code": code])
}

// MARK: - Availability Check

func checkAvailability() {
    switch SystemLanguageModel.default.availability {
    case .available:
        output(["available": true])
    case .unavailable(let reason):
        output(["available": false, "reason": String(describing: reason)])
    @unknown default:
        output(["available": false, "reason": "unknown"])
    }
}

// MARK: - Main

if CommandLine.arguments.contains("--check") {
    checkAvailability()
} else {
    // Read request from stdin
    let inputData = FileHandle.standardInput.readDataToEndOfFile()

    guard !inputData.isEmpty else {
        outputError("No input received on stdin", code: "no_input")
        exit(1)
    }

    guard let request = try? JSONDecoder().decode(BridgeRequest.self, from: inputData) else {
        outputError("Failed to parse request JSON", code: "parse_error")
        exit(1)
    }

    guard case .available = SystemLanguageModel.default.availability else {
        outputError("Apple Foundation Model is not available. Enable Apple Intelligence in System Settings.", code: "model_unavailable")
        exit(1)
    }

    // Extract system prompt and find last user message
    let systemPrompt = request.messages.first(where: { $0.role == "system" })?.content
    guard let lastUserMessage = request.messages.last(where: { $0.role == "user" }) else {
        outputError("No user message found in request", code: "no_user_message")
        exit(1)
    }

    // Build context: if there are intermediate messages, prepend them to the prompt
    // so the model has conversational context (LanguageModelSession doesn't support
    // injecting prior turns).
    var prompt = lastUserMessage.content
    let intermediateMessages = request.messages.filter { $0.role != "system" }
    if intermediateMessages.count > 1 {
        var context = "Previous conversation:\n"
        for msg in intermediateMessages.dropLast() {
            let label = msg.role == "user" ? "User" : "Assistant"
            context += "\(label): \(msg.content)\n"
        }
        context += "\nRespond to the latest message:"
        prompt = context + "\n" + prompt
    }

    do {
        let session: LanguageModelSession
        if let systemPrompt {
            session = LanguageModelSession(instructions: systemPrompt)
        } else {
            session = LanguageModelSession()
        }

        output(["type": "start"])

        let stream = session.streamResponse(to: prompt)
        var previousContent = ""

        for try await partial in stream {
            let current = partial.content
            if current.count > previousContent.count {
                let delta = String(current.dropFirst(previousContent.count))
                output(["type": "delta", "content": delta])
                previousContent = current
            }
        }

        // Estimate token usage (~4 chars per token for English text)
        let inputChars = request.messages.reduce(0) { $0 + $1.content.count }
        let outputChars = previousContent.count
        let inputTokens = max(1, inputChars / 4)
        let outputTokens = max(1, outputChars / 4)

        output([
            "type": "done",
            "content": previousContent,
            "usage": [
                "input_tokens": inputTokens,
                "output_tokens": outputTokens,
            ],
        ])
    } catch {
        outputError(error.localizedDescription, code: "generation_error")
        exit(1)
    }
}
