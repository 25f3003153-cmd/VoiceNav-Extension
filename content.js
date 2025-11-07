// 1. Initialize Speech Recognition (STT) and Synthesis (TTS)
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
const synthesis = window.speechSynthesis;

// Check if the browser supports the Web Speech API
if (!SpeechRecognition) {
  console.error("VoiceNav Error: Speech Recognition API not supported.");
} else {
  const recognition = new SpeechRecognition();
  let isListening = false;
  let commandLog = [];
  let pendingAction = null; // NEW: To manage confirmation steps

  // Configure recognition
  recognition.continuous = true;
  recognition.interimResults = false;
  recognition.lang = 'en-US';

  // --- Core Recognition Functions ---

  function startListening() {
    if (isListening) return;
    isListening = true;
    try {
      recognition.start();
      speak("Voice navigation activated.");
    } catch (e) {
      console.warn("VoiceNav:", e.message);
    }
    chrome.runtime.sendMessage({ statusUpdate: true, isListening: true });
  }

  function stopListening() {
    if (!isListening) return;
    isListening = false;
    recognition.stop();
    synthesis.cancel();
    pendingAction = null; // NEW: Clear any pending actions
    speak("Voice navigation deactivated.");
    chrome.runtime.sendMessage({ statusUpdate: true, isListening: false });
  }

  // --- Event Handlers for Recognition ---

  recognition.onresult = (event) => {
    const lastResult = event.results[event.results.length - 1];
    const command = lastResult[0].transcript.trim().toLowerCase();

    commandLog.push(command);
    chrome.runtime.sendMessage({ newLogEntry: command });

    console.log("VoiceNav Command:", command);
    handleCommand(command);
  };

  recognition.onend = () => {
    if (isListening) {
      try {
        recognition.start();
      } catch(e) {
        console.warn("VoiceNav: Restart error:", e.message);
      }
    }
  };

  recognition.onerror = (event) => {
    console.error("VoiceNav Error:", event.error);
  };

  // --- Command and Control Logic ---
  
  function handleCommand(command) {
    // --- NEW: Handle pending confirmation ---
    if (pendingAction) {
      const action = pendingAction; // Copy action
      pendingAction = null; // Clear it immediately

      if (command.includes('yes') || command.includes('confirm')) {
        if (action.type === 'readButtons') {
          const buttonList = action.data.join(' . ');
          speak(`The buttons are: . ${buttonList}`);
        }
        return; // Action was handled
      } else if (command.includes('no') || command.includes('cancel')) {
        speak("Okay, action cancelled.");
        return; // Action was handled
      }
      // If the command wasn't "yes" or "no", we fall through
      // and treat it as a new, separate command, cancelling the pending one.
    }
    // --- END: Handle pending confirmation ---


    if (command.includes("scroll down")) {
      window.scrollBy(0, 500);
    } else if (command.includes("scroll up")) {
      window.scrollBy(0, -500);
    } else if (command.includes("go back")) {
      history.back();
    } else if (command.includes("go forward")) {
      history.forward();
    } else if (command.includes("open first article") || command.includes("open first link")) {
      const firstLink = document.querySelector('article a, main a, a');
      if (firstLink) {
        speak(`Opening link: ${firstLink.textContent}`);
        firstLink.click();
      } else {
        speak("No links found.");
      }
    } else if (command.includes("read this section aloud") || command.includes("read page")) {
      readMainContent();
    } else if (command.includes("stop reading")) {
      synthesis.cancel();
    }
    // --- NEW: Read Buttons Command ---
    else if (command.includes("read buttons") || command.includes("list buttons")) {
      const buttons = document.querySelectorAll('button, [role="button"]');
      const buttonTexts = Array.from(buttons)
                                .map(b => b.textContent.trim())
                                .filter(t => t.length > 0);
      
      if (buttonTexts.length > 0) {
        pendingAction = { type: 'readButtons', data: buttonTexts };
        speak(`I found ${buttonTexts.length} buttons. Would you like me to read them?`);
      } else {
        speak("I could not find any buttons on this page.");
      }
    }
    // --- END: Read Buttons Command ---
    else if (command.includes("help") || command.includes("what can i say") || command.includes("show commands")) {
      // MODIFIED: Added "read buttons" to help text
      const helpText = "Here are the commands you can use: . Scroll down. . Scroll up. . Go back. . Go forward. . Open first link. . Read page. . Read buttons. . Stop reading. . and . Help.";
      speak(helpText);
    }
  }

  function speak(text) {
    if (synthesis.speaking) {
      synthesis.cancel();
    }
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.onend = () => {
      if (isListening) {
        try {
          recognition.start();
        } catch(e) {
          console.log("Recognition stopped.");
        }
      }
    };
    if (isListening) {
        recognition.stop();
    }
    synthesis.speak(utterance);
  }

  // --- MODIFIED: readMainContent ---
  function readMainContent() {
    let content = '';
    const mainElement = document.querySelector('main') || document.querySelector('article') || document.body;
    
    // Select main readable elements
    const readableElements = mainElement.querySelectorAll('h1, h2, h3, p, li');

    if (readableElements.length > 0) {
      readableElements.forEach(el => {
        // Clone the element to avoid changing the live page
        const elClone = el.cloneNode(true);
        
        // Remove all links and buttons from the clone
        elClone.querySelectorAll('a, button').forEach(child => child.remove());
        
        // Get the cleaned text
        const cleanText = elClone.textContent.trim();
        
        if (cleanText.length > 0) {
          content += cleanText + ' . ';
        }
      });
    } else {
      // Fallback if no specific tags are found (with the same cleaning logic)
      const mainClone = mainElement.cloneNode(true);
      mainClone.querySelectorAll('a, button').forEach(child => child.remove());
      content = mainClone.textContent;
    }

    if (content.trim().length === 0) {
      speak("No readable text content found on this page.");
    } else {
      speak(content);
    }
  }
  // --- END: MODIFIED readMainContent ---


  // 5. Listen for messages from popup AND background script
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.command === "startListening") {
      startListening();
      sendResponse({ status: "Listening started." });
    } else if (request.command === "stopListening") {
      stopListening();
      sendResponse({ status: "Listening stopped." });
    } else if (request.command === "toggleListening") {
      if (isListening) {
        stopListening();
      } else {
        startListening();
      }
      sendResponse({ status: isListening ? "Now listening" : "Now stopped" });
    } else if (request.command === "getStatus") {
      sendResponse({ isListening: isListening });
    } else if (request.command === "getLog") {
      sendResponse({ log: commandLog });
    }
    return true;
  });
}