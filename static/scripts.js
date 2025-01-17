let currentConversationId = null;
let isProcessing = false;
let isAutoCompleting = false;
let autoCompleteTimeout = null;

MathJax = {
    tex: {inlineMath: [['$', '$'], ['\\(', '\\)']]}
};

// 加载对话列表
async function loadConversations() {
    try {
        const response = await fetch('/conversations');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const conversations = await response.json();
        const listElement = document.getElementById('conversation-list');
        listElement.innerHTML = '';
        
        conversations.forEach(conv => {
            const item = document.createElement('div');
            item.className = `conversation-item ${conv.id === currentConversationId ? 'active' : ''}`;
            item.innerHTML = `
                <span class="conversation-title">${conv.title}</span>
                <button class="btn btn-sm btn-link text-danger delete-btn" 
                    onclick="event.stopPropagation(); deleteConversation(${conv.id})">
                    <i class="bi bi-trash"></i>
                </button>
            `;
            item.onclick = () => loadConversation(conv.id);
            listElement.appendChild(item);
        });

        // 添加 MathJax 渲染
        if (window.MathJax) {
            await MathJax.typesetPromise();
        }
    } catch (error) {
        console.error('Error loading conversations:', error);
    }
}

// 加载特定对话
async function loadConversation(conversationId) {
    try {
        const response = await fetch(`/conversations/${conversationId}`);
        const conversation = await response.json();
        currentConversationId = conversation.id;
        
        // 更新UI
        const messagesDiv = document.getElementById('chat-messages');
        messagesDiv.innerHTML = '';
        
        // 显示消息历史
        conversation.messages.forEach(msg => {
            appendMessage(msg.content, msg.role === 'user');
        });

        // 添加 MathJax 渲染
        if (window.MathJax) {
            await MathJax.typesetPromise();
        }
        
        // 更新对话列表中的活动状态
        document.querySelectorAll('.conversation-item').forEach(item => {
            item.classList.remove('active');
            if (item.querySelector('.conversation-title').textContent === conversation.title) {
                item.classList.add('active');
            }
        });

        // 滚动到底部
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
    } catch (error) {
        console.error('Error loading conversation:', error);
    }
}

// 删除对话
async function deleteConversation(conversationId) {
    if (!confirm('确定要删除这个对话吗？')) return;
    
    try {
        await fetch(`/conversations/${conversationId}`, {
            method: 'DELETE'
        });
        
        if (currentConversationId === conversationId) {
            currentConversationId = null;
            document.getElementById('chat-messages').innerHTML = '';
        }
        
        await loadConversations();
    } catch (error) {
        console.error('Error deleting conversation:', error);
    }
}

// 配置 marked
marked.setOptions({
    highlight: function(code, lang) {
        const language = hljs.getLanguage(lang) ? lang : 'plaintext';
        return hljs.highlight(code, { language }).value;
    },
    langPrefix: 'hljs language-',
    breaks: true,
    gfm: true
});

// 处理代码块，添加复制按钮
function processCodeBlocks(element) {
    element.querySelectorAll('pre code').forEach((block) => {
        // 确保代码块被 highlight.js 处理
        hljs.highlightElement(block);
        
        const pre = block.parentElement;
        const header = document.createElement('div');
        header.className = 'code-block-header';
        
        // 获取语言
        const language = block.className.split(' ').find(cls => cls.startsWith('language-'))?.replace('language-', '') || 'plaintext';
        const langSpan = document.createElement('span');
        langSpan.className = 'code-language';
        langSpan.textContent = language;
        header.appendChild(langSpan);
        
        // 添加复制按钮
        const copyButton = document.createElement('button');
        copyButton.className = 'copy-button';
        copyButton.textContent = '复制';
        copyButton.onclick = async () => {
            try {
                await navigator.clipboard.writeText(block.textContent);
                copyButton.textContent = '已复制';
                copyButton.classList.add('copied');
                setTimeout(() => {
                    copyButton.textContent = '复制';
                    copyButton.classList.remove('copied');
                }, 2000);
            } catch (err) {
                console.error('Failed to copy:', err);
            }
        };
        header.appendChild(copyButton);
        
        pre.insertBefore(header, block);
    });
}



// 改进消息处理函数
function appendMessage(content, isUser) {
    const messagesDiv = document.getElementById('chat-messages');
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${isUser ? 'user-message' : 'assistant-message'}`;
    
    const contentDiv = document.createElement('div');
    contentDiv.className = 'content markdown-content';
    
    try {
        // 创建一个临时元素来处理内容
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = content;

        // 替换数学公式中的方括号为两个美元符号，排除 <pre> 标签内的内容
        tempDiv.childNodes.forEach(node => {
            if (node.nodeType === Node.TEXT_NODE) {
                node.textContent = node.textContent.replace(/\[/g, '$$$$').replace(/\]/g, '$$$$');
            }
        });

        // 使用 marked 处理 Markdown
        contentDiv.innerHTML = marked.parse(tempDiv.innerHTML);
        
        processCodeBlocks(contentDiv);
        
        // 添加公式块的复制功能
        contentDiv.querySelectorAll('.katex-display').forEach(formula => {
            formula.style.position = 'relative';
            const copyBtn = document.createElement('button');
            copyBtn.className = 'copy-button';
            copyBtn.style.position = 'absolute';
            copyBtn.style.right = '0';
            copyBtn.style.top = '0';
            copyBtn.textContent = '复制';
            copyBtn.onclick = async () => {
                try {
                    // 获取原始 LaTeX 代码
                    const tex = formula.querySelector('.katex-mathml annotation').textContent;
                    await navigator.clipboard.writeText(tex);
                    copyBtn.textContent = '已复制';
                    setTimeout(() => {
                        copyBtn.textContent = '复制';
                    }, 2000);
                } catch (err) {
                    console.error('Failed to copy formula:', err);
                }
            };
            formula.appendChild(copyBtn);
        });
    } catch (error) {
        console.error('Error processing content:', error);
        contentDiv.textContent = content;
    }
    
    messageDiv.appendChild(contentDiv);
    
    const timeSpan = document.createElement('div');
    timeSpan.className = 'timestamp';
    timeSpan.textContent = new Date().toLocaleTimeString();
    messageDiv.appendChild(timeSpan);
    
    messagesDiv.appendChild(messageDiv);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;

    // 添加 MathJax 渲染
    if (window.MathJax && typeof window.MathJax.typeset === 'function') {
        window.MathJax.typeset();
    }
}

function createTypingIndicator() {
    const messagesDiv = document.getElementById('chat-messages');
    const indicatorDiv = document.createElement('div');
    indicatorDiv.className = 'message assistant-message typing-indicator';
    indicatorDiv.id = 'typing-indicator';
    messagesDiv.appendChild(indicatorDiv);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

function removeTypingIndicator() {
    const indicator = document.getElementById('typing-indicator');
    if (indicator) {
        indicator.remove();
    }
}

async function newChat() {
    if (isProcessing) {
        if (!confirm('当前对话正在进行中，确定要开始新对话吗？')) {
            return;
        }
    }
    
    try {
        const response = await fetch('/conversations', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                title: ''  // 空标题，将由第一条消息设置
            })
        });
        
        const conversation = await response.json();
        currentConversationId = conversation.id;
        
        // 清空聊天界面
        document.getElementById('chat-messages').innerHTML = '';
        document.getElementById('user-input').value = '';
        
        // 重置处理状态
        isProcessing = false;
        
        // 刷新对话列表
        await loadConversations();
        
        // 添加欢迎消息
        appendMessage('您好！我是 DeepSeek AI 助手，请问有什么可以帮您？', false);
    } catch (error) {
        console.error('Error creating new conversation:', error);
    }
}

function handleError(error, customMessage = null) {
    console.error('Error:', error);
    removeTypingIndicator();
    const errorMessage = customMessage || '抱歉，发生了错误，请重试。';
    appendMessage(errorMessage, false);
    isProcessing = false;
}




async function sendMessage() {
    if (isProcessing || isAutoCompleting) return;
    
    const input = document.getElementById('user-input');
    const message = input.value.trim();
    
    if (!message) return;
    
    isProcessing = true;
    input.value = '';
    
    // 清除任何待处理的续写请求
    if (autoCompleteTimeout) {
        clearTimeout(autoCompleteTimeout);
    }

    // Add user message to UI
    appendMessage(message, true);
    
    // Show typing indicator
    createTypingIndicator();
    
    try {
        const response = await fetch('/ask', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                question: message,
                conversation_id: currentConversationId
            })
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const reader = response.body.getReader();
        let assistantResponse = '';
        // 流式处理
        // 开始流式处理响应
        while (true) {
            try {
                // 读取响应数据
                const {value, done} = await reader.read();
                if (done) break; // 如果读取完成，退出循环
                
                // 解码读取到的值并按行分割
                const text = new TextDecoder().decode(value);
                const lines = text.split('\n');
                
                // 处理每一行
                for (const line of lines) {
                    if (line.trim()) { // 如果行不为空
                        try {
                            // 解析JSON数据
                            const chunk = JSON.parse(line);
                            if (chunk.answer) { // 如果有回答
                                if (!assistantResponse) {
                                    removeTypingIndicator(); // 移除输入指示器
                                }
                                assistantResponse += chunk.answer; // 累加助手的回答
                                const lastMessage = document.querySelector('.assistant-message:last-child');
                                if (lastMessage && !lastMessage.classList.contains('typing-indicator')) {
                                    const contentDiv = lastMessage.querySelector('.content');
                                    if (contentDiv) {
                                        try {
                                            // 更新内容并处理
                                            
                                            contentDiv.innerHTML = marked.parse(assistantResponse);
                                            processContent(contentDiv);
                                        } catch (error) {
                                            console.error('Error updating message:', error);
                                            contentDiv.textContent = assistantResponse; // 如果更新失败，使用文本内容
                                        }
                                    }
                                } else {
                                    appendMessage(assistantResponse, false); // 如果没有最后一条消息，直接添加
                                }
                                
                                // 更新当前对话ID
                                if (chunk.conversation_id) {
                                    currentConversationId = chunk.conversation_id;
                                }
                            } else if (chunk.error) { // 如果有错误
                                handleError(chunk.error, '抱歉，服务器返回错误：' + chunk.error);
                                return;
                            }
                        } catch (parseError) {
                            console.error('Error parsing JSON:', parseError, 'Raw line:', line); // 处理JSON解析错误
                            continue; // 继续处理下一行
                        }
                    }
                }
            } catch (streamError) {
                handleError(streamError, '抱歉，读取响应时发生错误。'); // 处理流读取错误
                return;
            }
        }
        
        // 刷新对话列表
        await loadConversations();
        
    } catch (error) {
        handleError(error);
    } finally {
        isProcessing = false;
    }
}

// 添加快捷键支持
document.addEventListener('keydown', function(e) {
    if (e.ctrlKey && e.key === 'Enter') {
        sendMessage();
    }
});

// 修改菜单切换函数
function toggleSidebar(e) {
    if (e) {
        e.preventDefault();
    }
    const sidebar = document.querySelector('.sidebar');
    const backdrop = document.querySelector('.sidebar-backdrop');
    
    sidebar.classList.toggle('show');
    backdrop.classList.toggle('show');
}

// 添加遮罩层到 body
document.addEventListener('DOMContentLoaded', function() {
    // 创建遮罩层
    const backdrop = document.createElement('div');
    backdrop.className = 'sidebar-backdrop';
    document.body.appendChild(backdrop);

    // 绑定菜单按钮事件
    const menuToggle = document.getElementById('menu-toggle');
    if (menuToggle) {
        menuToggle.addEventListener('click', toggleSidebar);
    }

    // 关闭按钮点击事件
    const closeButton = document.querySelector('.close-sidebar');
    if (closeButton) {
        closeButton.addEventListener('click', toggleSidebar);
    }

    // 遮罩层点击事件
    backdrop.addEventListener('click', toggleSidebar);

    // 阻止侧边栏点击事件冒泡
    const sidebar = document.querySelector('.sidebar');
    if (sidebar) {
        sidebar.addEventListener('click', function(e) {
            e.stopPropagation();
        });
    }

    // 加载对话
    loadConversations().then(() => {
        if (!currentConversationId) {
            appendMessage('您好！我是 DeepSeek AI 助手，请问有什么可以帮您？', false);
        }
    });


});

// 监听窗口大小变化
window.addEventListener('resize', function() {
    const sidebar = document.querySelector('.sidebar');
    const backdrop = document.querySelector('.sidebar-backdrop');
    if (window.innerWidth > 768) {
        sidebar.classList.remove('show');
        backdrop.classList.remove('show');
    }
});

// 添加 MathJax 配置
window.MathJax = {
    tex: {
        inlineMath: [['$', '$'], ['\\(', '\\)']],
        displayMath: [['$$', '$$'], ['\\[', '\\]']],
        processEscapes: true,
        processEnvironments: true
    },
    options: {
        skipHtmlTags: ['script', 'noscript', 'style', 'textarea', 'pre']
    }
};

// 处理输入变化
async function handleInputChange(e) {
    const input = e.target;
    const text = input.value;
    
    // 清除之前的超时
    if (autoCompleteTimeout) {
        clearTimeout(autoCompleteTimeout);
    }

    // 如果正在处理其他请求，则返回
    if (isProcessing || isAutoCompleting) {
        return;
    }

    // 设置500ms的延迟来避免频繁请求
    autoCompleteTimeout = setTimeout(async () => {
        if (text.trim().length > 0) {
            await autoComplete(text);
        }
    }, 500);
}

// 自动续写功能
async function autoComplete(text) {
    try {
        isAutoCompleting = true;
        
        const response = await fetch('/auto_complete', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                text: text,
                conversation_id: currentConversationId
            })
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        if (data.completion) {
            const input = document.getElementById('user-input');
            const currentPosition = input.selectionStart;
            
            // 只在光标位置后添加续写内容
            const beforeCursor = input.value.substring(0, currentPosition);
            const afterCursor = input.value.substring(currentPosition);
            input.value = beforeCursor + data.completion + afterCursor;
            
            // 保持光标在原位置
            input.selectionStart = currentPosition + data.completion.length; // 更新光标位置
            input.selectionEnd = input.selectionStart;
        }
    } catch (error) {
        console.error('Auto-complete error:', error);
    } finally {
        isAutoCompleting = false;
    }
}

function renderContent() {
    const input = document.getElementById('user-input');
    const contentDiv = document.createElement('div');
    contentDiv.className = 'content markdown-content';
    contentDiv.innerHTML = marked.parse(input.value); // 使用 marked 处理输入内容
    
    processCodeBlocks(contentDiv); // 调用处理代码块的函数
}
