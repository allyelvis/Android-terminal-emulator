import React, { useState, useEffect, useRef } from 'react';

// --- File System Utilities ---
const initialFS = {
  type: 'dir',
  contents: {
    'sdcard': {
      type: 'dir',
      contents: {
        'Download': { type: 'dir', contents: {} },
        'DCIM': { type: 'dir', contents: {} },
        'Documents': { type: 'dir', contents: {} },
      }
    },
    'system': {
      type: 'dir',
      contents: {
        'bin': { type: 'dir', contents: { 'sh': { type: 'file', content: '<binary data>' } } },
        'etc': { type: 'dir', contents: {} },
        'build.prop': { type: 'file', content: 'ro.build.version.release=14\nro.product.model=Pixel Emulator\nro.build.characteristics=emulator' }
      }
    },
    'home': {
      type: 'dir',
      contents: {
        'user': {
          type: 'dir',
          contents: {
            'readme.txt': { type: 'file', content: 'Welcome to the Android Web Terminal!\n\nThis is a simulated bash environment.\nType "help" to see available commands.\nTry exploring /sdcard or /system.' }
          }
        }
      }
    },
    'dev': {
      type: 'dir',
      contents: {
        'null': { type: 'file', content: '' }
      }
    }
  }
};

const normalizePath = (path) => {
  const parts = path.split('/').filter(Boolean);
  const result = [];
  for (const part of parts) {
    if (part === '.') continue;
    if (part === '..') {
      result.pop();
    } else {
      result.push(part);
    }
  }
  return '/' + result.join('/');
};

const resolvePath = (current, target) => {
  if (target.startsWith('/')) return normalizePath(target);
  return normalizePath(current === '/' ? `/${target}` : `${current}/${target}`);
};

const getNode = (fs, path) => {
  if (path === '/') return fs;
  const parts = path.split('/').filter(Boolean);
  let current = fs;
  for (const part of parts) {
    if (current.type !== 'dir' || !current.contents[part]) return null;
    current = current.contents[part];
  }
  return current;
};

// --- Main Application Component ---
export default function App() {
  const [fileSystem, setFileSystem] = useState(initialFS);
  const [currentPath, setCurrentPath] = useState('/home/user');
  const [history, setHistory] = useState([
    { type: 'output', content: 'Welcome to Android Termux-style Emulator v1.0.0' },
    { type: 'output', content: 'Type "help" for a list of available commands.' }
  ]);
  const [input, setInput] = useState('');
  const [commandHistory, setCommandHistory] = useState([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [user, setUser] = useState('user'); // 'user' or 'root'
  
  const bottomRef = useRef(null);
  const inputRef = useRef(null);

  // Auto-scroll to bottom when history changes
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [history]);

  // Keep focus on input when clicking terminal
  const handleTerminalClick = () => {
    inputRef.current?.focus();
  };

  const printLine = (content, isError = false) => {
    setHistory(prev => [...prev, { type: 'output', content, isError }]);
  };

  const getPrompt = () => {
    const displayPath = currentPath.startsWith('/home/user') 
      ? currentPath.replace('/home/user', '~') 
      : currentPath;
    const symbol = user === 'root' ? '#' : '$';
    return `${user}@localhost:${displayPath}${symbol} `;
  };

  // --- Command Execution Logic ---
  const executeCommand = (cmdStr) => {
    const trimmedCmd = cmdStr.trim();
    if (!trimmedCmd) return;

    setCommandHistory(prev => [...prev, trimmedCmd]);
    setHistoryIndex(-1);
    
    // Add command to history
    setHistory(prev => [...prev, { type: 'command', prompt: getPrompt(), content: trimmedCmd }]);

    const args = trimmedCmd.split(/\s+/);
    const cmd = args[0];

    switch (cmd) {
      case 'help':
        printLine('Available commands:');
        printLine('  help      - Show this help message');
        printLine('  clear     - Clear the terminal screen');
        printLine('  ls        - List directory contents');
        printLine('  cd <dir>  - Change current directory');
        printLine('  pwd       - Print working directory');
        printLine('  mkdir     - Create a new directory');
        printLine('  touch     - Create an empty file');
        printLine('  cat <file>- Concatenate and print files');
        printLine('  echo      - Write arguments to standard output');
        printLine('  whoami    - Print effective userid');
        printLine('  su        - Switch to root user');
        printLine('  exit      - Switch back to normal user (if root)');
        printLine('  date      - Print current date and time');
        printLine('  uname -a  - Print system information');
        break;

      case 'clear':
        setHistory([]);
        break;

      case 'pwd':
        printLine(currentPath);
        break;

      case 'whoami':
        printLine(user);
        break;

      case 'su':
        setUser('root');
        printLine('Switched to root user.');
        break;

      case 'exit':
        if (user === 'root') {
          setUser('user');
        } else {
          printLine('Cannot exit. Emulator session active.');
        }
        break;

      case 'date':
        printLine(new Date().toString());
        break;

      case 'uname':
        if (args[1] === '-a') {
          printLine('Linux localhost 5.10.198-android14-9-g8a3a #1 SMP PREEMPT Thu Jan 1 00:00:00 UTC 2026 aarch64 GNU/Linux');
        } else {
          printLine('Linux');
        }
        break;

      case 'echo':
        printLine(args.slice(1).join(' '));
        break;

      case 'ls': {
        const targetPath = resolvePath(currentPath, args[1] || '.');
        const node = getNode(fileSystem, targetPath);
        
        if (!node) {
          printLine(`ls: cannot access '${args[1]}': No such file or directory`, true);
        } else if (node.type === 'file') {
          printLine(args[1]);
        } else {
          const names = Object.keys(node.contents).sort();
          if (names.length === 0) break;
          
          // Format output to look like columns (simplified)
          const formattedNames = names.map(name => {
            const childNode = node.contents[name];
            return childNode.type === 'dir' ? `<dir> ${name}` : `      ${name}`;
          }).join('\n');
          printLine(formattedNames);
        }
        break;
      }

      case 'cd': {
        const targetDir = args[1] || '/home/user';
        const newPath = resolvePath(currentPath, targetDir);
        const node = getNode(fileSystem, newPath);

        if (!node) {
          printLine(`cd: ${targetDir}: No such file or directory`, true);
        } else if (node.type !== 'dir') {
          printLine(`cd: ${targetDir}: Not a directory`, true);
        } else {
          setCurrentPath(newPath);
        }
        break;
      }

      case 'mkdir': {
        if (!args[1]) {
          printLine('mkdir: missing operand', true);
          break;
        }
        const newDirPath = resolvePath(currentPath, args[1]);
        const parentPath = normalizePath(newDirPath + '/..');
        const dirName = newDirPath.split('/').pop();
        
        let newFS = JSON.parse(JSON.stringify(fileSystem)); // Deep copy for immutability
        const parentNode = getNode(newFS, parentPath);

        if (!parentNode || parentNode.type !== 'dir') {
          printLine(`mkdir: cannot create directory '${args[1]}': No such file or directory`, true);
        } else if (parentNode.contents[dirName]) {
          printLine(`mkdir: cannot create directory '${args[1]}': File exists`, true);
        } else {
          parentNode.contents[dirName] = { type: 'dir', contents: {} };
          setFileSystem(newFS);
        }
        break;
      }

      case 'touch': {
        if (!args[1]) {
          printLine('touch: missing file operand', true);
          break;
        }
        const newFilePath = resolvePath(currentPath, args[1]);
        const parentPath = normalizePath(newFilePath + '/..');
        const fileName = newFilePath.split('/').pop();
        
        let newFS = JSON.parse(JSON.stringify(fileSystem));
        const parentNode = getNode(newFS, parentPath);

        if (!parentNode || parentNode.type !== 'dir') {
          printLine(`touch: cannot touch '${args[1]}': No such file or directory`, true);
        } else if (!parentNode.contents[fileName]) {
          parentNode.contents[fileName] = { type: 'file', content: '' };
          setFileSystem(newFS);
        }
        break;
      }

      case 'cat': {
        if (!args[1]) {
          printLine('cat: missing operand', true);
          break;
        }
        const filePath = resolvePath(currentPath, args[1]);
        const node = getNode(fileSystem, filePath);

        if (!node) {
          printLine(`cat: ${args[1]}: No such file or directory`, true);
        } else if (node.type === 'dir') {
          printLine(`cat: ${args[1]}: Is a directory`, true);
        } else {
          printLine(node.content);
        }
        break;
      }

      default:
        printLine(`bash: ${cmd}: command not found`, true);
        break;
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      executeCommand(input);
      setInput('');
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (commandHistory.length > 0) {
        const nextIndex = historyIndex + 1 < commandHistory.length ? historyIndex + 1 : historyIndex;
        setHistoryIndex(nextIndex);
        setInput(commandHistory[commandHistory.length - 1 - nextIndex] || '');
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIndex > 0) {
        const nextIndex = historyIndex - 1;
        setHistoryIndex(nextIndex);
        setInput(commandHistory[commandHistory.length - 1 - nextIndex]);
      } else if (historyIndex === 0) {
        setHistoryIndex(-1);
        setInput('');
      }
    } else if (e.key === 'c' && e.ctrlKey) {
      // Simulate Ctrl+C
      setHistory(prev => [...prev, { type: 'command', prompt: getPrompt(), content: input + '^C' }]);
      setInput('');
      setHistoryIndex(-1);
    }
  };

  return (
    <div 
      className="flex flex-col w-full h-screen bg-[#101010] text-[#00FF00] font-mono text-sm sm:text-base overflow-hidden selection:bg-[#00FF00] selection:text-[#101010]"
      onClick={handleTerminalClick}
    >
      {/* Top Bar simulating Android App Header */}
      <div className="flex items-center justify-center py-2 bg-[#202020] text-gray-300 text-xs shadow-md border-b border-[#303030]">
        <span>Terminal Emulator</span>
      </div>

      {/* Terminal Output Area */}
      <div className="flex-1 overflow-y-auto p-2 sm:p-4 pb-20 scrollbar-hide">
        {history.map((item, index) => (
          <div key={index} className="mb-1 break-words whitespace-pre-wrap">
            {item.type === 'command' && (
              <div>
                <span className="text-blue-400 font-bold">{item.prompt.split('$')[0]}{item.prompt.includes('#') ? '#' : '$'}</span>
                <span className="ml-1">{item.content}</span>
              </div>
            )}
            {item.type === 'output' && (
              <div className={`${item.isError ? 'text-red-400' : 'text-gray-200'}`}>
                {item.content}
              </div>
            )}
          </div>
        ))}

        {/* Current Input Line */}
        <div className="flex items-center">
          <span className="text-blue-400 font-bold shrink-0">
            {getPrompt().split(user === 'root' ? '#' : '$')[0]}{user === 'root' ? '#' : '$'}
          </span>
          <span className="ml-1 shrink-0"></span>
          <input
            ref={inputRef}
            type="text"
            className="flex-1 bg-transparent border-none outline-none text-[#00FF00] caret-[#00FF00] w-full"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            autoFocus
            spellCheck="false"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="none"
          />
        </div>
        
        {/* Invisible div to scroll to bottom */}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}

