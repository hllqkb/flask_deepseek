from flask import Flask, request, Response, send_from_directory, render_template, jsonify
from openai import OpenAI
from flask_sqlalchemy import SQLAlchemy
import json
import os
import logging
from dotenv import load_dotenv
from datetime import datetime
from flasgger import Swagger

# 配置日志
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

# 加载环境变量
load_dotenv()

app = Flask(__name__)
swagger = Swagger(app)

# 数据库配置 - 使用 SQLite
db_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'deepseek_chat.db')
app.config['SQLALCHEMY_DATABASE_URI'] = f'sqlite:///{db_path}'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

try:
    db = SQLAlchemy(app)
    logger.info("Database configuration loaded successfully")
except Exception as e:
    logger.error(f"Error configuring database: {str(e)}")
    raise

# 配置DeepSeek API
DEEPSEEK_API_KEY = os.getenv("DEEPSEEK_API_KEY")
DEEPSEEK_BASE_URL = os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com")

if not DEEPSEEK_API_KEY:
    logger.error("DEEPSEEK_API_KEY not found in environment variables")
    raise ValueError("DEEPSEEK_API_KEY is required")

# 初始化OpenAI客户端
client = OpenAI(api_key=DEEPSEEK_API_KEY, base_url=DEEPSEEK_BASE_URL)

# 数据库模型
class Conversation(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(200), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    messages = db.relationship('Message', backref='conversation', lazy=True, cascade='all, delete-orphan')

class Message(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    conversation_id = db.Column(db.Integer, db.ForeignKey('conversation.id'), nullable=False)
    role = db.Column(db.String(20), nullable=False)
    content = db.Column(db.Text, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

# 创建数据库表
try:
    with app.app_context():
        db.create_all()
        logger.info("Database tables created successfully")
except Exception as e:
    logger.error(f"Error creating database tables: {str(e)}")
    raise

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/conversations', methods=['GET'])
def get_conversations():
    try:
        conversations = Conversation.query.order_by(Conversation.updated_at.desc()).all()
        return jsonify([{
            'id': conv.id,
            'title': conv.title,
            'created_at': conv.created_at.isoformat(),
            'updated_at': conv.updated_at.isoformat()
        } for conv in conversations])
    except Exception as e:
        logger.error(f"Error getting conversations: {str(e)}")
        return jsonify({"error": str(e)}), 500

@app.route('/conversations', methods=['POST'])
def create_conversation():
    try:
        data = request.json
        title = data.get('title', '新对话')  # 默认标题为"新对话"
        conversation = Conversation(title=title)
        db.session.add(conversation)
        db.session.commit()
        logger.info(f"Created new conversation with id {conversation.id}")
        return jsonify({
            'id': conversation.id,
            'title': conversation.title,
            'created_at': conversation.created_at.isoformat(),
            'updated_at': conversation.updated_at.isoformat()
        })
    except Exception as e:
        logger.error(f"Error creating conversation: {str(e)}")
        db.session.rollback()
        return jsonify({"error": str(e)}), 500

@app.route('/conversations/<int:conversation_id>', methods=['GET'])
def get_conversation(conversation_id):
    try:
        conversation = Conversation.query.get_or_404(conversation_id)
        messages = [{
            'role': msg.role,
            'content': msg.content,
            'created_at': msg.created_at.isoformat()
        } for msg in conversation.messages]
        return jsonify({
            'id': conversation.id,
            'title': conversation.title,
            'messages': messages,
            'created_at': conversation.created_at.isoformat(),
            'updated_at': conversation.updated_at.isoformat()
        })
    except Exception as e:
        logger.error(f"Error getting conversation {conversation_id}: {str(e)}")
        return jsonify({"error": str(e)}), 500

@app.route('/conversations/<int:conversation_id>', methods=['DELETE'])
def delete_conversation(conversation_id):
    try:
        conversation = Conversation.query.get_or_404(conversation_id)
        db.session.delete(conversation)
        db.session.commit()
        logger.info(f"Deleted conversation {conversation_id}")
        return '', 204
    except Exception as e:
        logger.error(f"Error deleting conversation {conversation_id}: {str(e)}")
        db.session.rollback()
        return jsonify({"error": str(e)}), 500

@app.route('/ask', methods=['POST'])
def ask():
    try:
        data = request.json
        question = data.get('question')
        conversation_id = data.get('conversation_id')
        
        if not question:
            return jsonify({"error": "Question is required"}), 400

        # 获取或创建对话
        try:
            if conversation_id:
                conversation = Conversation.query.get_or_404(conversation_id)
                # 如果是对话的第一条消息，更新标题
                if not conversation.messages:
                    conversation.title = question
                    db.session.commit()
            else:
                # 创建新对话，使用第一条消息作为标题
                conversation = Conversation(title=question)
                db.session.add(conversation)
                db.session.commit()
                logger.info(f"Created new conversation {conversation.id} with title: {question}")
        except Exception as e:
            logger.error(f"Error with conversation: {str(e)}")
            raise

        # 保存用户消息
        try:
            user_message = Message(
                conversation_id=conversation.id,
                role='user',
                content=question
            )
            db.session.add(user_message)
            db.session.commit()
        except Exception as e:
            logger.error(f"Error saving user message: {str(e)}")
            db.session.rollback()
            raise

        # 构建消息历史
        messages = [
            {"role": "system", "content": "You are a helpful assistant. Please provide clear and concise responses in Chinese."}
        ]
        
        # 添加历史消息
        for msg in conversation.messages[:-1]:
            messages.append({"role": msg.role, "content": msg.content})
        
        # 添加最新的用户消息
        messages.append({"role": "user", "content": question})

        # 调用DeepSeek API
        try:
            response = client.chat.completions.create(
                model="deepseek-chat",
                messages=messages,
                stream=True,
                temperature=0.7,
                max_tokens=2000
            )
        except Exception as e:
            logger.error(f"Error calling DeepSeek API: {str(e)}")
            raise

        def generate():
            assistant_response = ''
            try:
                for chunk in response:
                    if chunk.choices and chunk.choices[0].delta.content:
                        content = chunk.choices[0].delta.content
                        assistant_response += content
                        yield json.dumps({
                            "answer": content,
                            "conversation_id": conversation.id
                        }) + "\n"
                
                # 保存助手回复
                if assistant_response:
                    try:
                        with app.app_context():
                            assistant_message = Message(
                                conversation_id=conversation.id,
                                role='assistant',
                                content=assistant_response
                            )
                            db.session.add(assistant_message)
                            db.session.commit()
                            logger.info(f"Saved assistant response for conversation {conversation.id}")
                    except Exception as e:
                        logger.error(f"Error saving assistant response: {str(e)}")
                        db.session.rollback()
            except Exception as e:
                logger.error(f"Error in generate function: {str(e)}")
                yield json.dumps({"error": str(e)}) + "\n"

        return Response(generate(), mimetype='application/json')

    except Exception as e:
        logger.error(f"Error in ask endpoint: {str(e)}")
        return jsonify({"error": str(e)}), 500

@app.route('/auto_complete', methods=['POST'])
def auto_complete():
    try:
        data = request.json
        text = data.get('text')
        conversation_id = data.get('conversation_id')

        if not text:
            return jsonify({"error": "No text provided"}), 400

        # 获取或创建对话
        conversation = None
        if conversation_id:
            conversation = Conversation.query.get_or_404(conversation_id)
        else:
            conversation = Conversation(title="新对话")
            db.session.add(conversation)
            db.session.commit()

        # 构建消息历史
        messages = [
            {"role": "system", "content": "You are a helpful assistant. Please provide clear and concise responses in Chinese."}
        ]

        # 添加历史消息
        for msg in conversation.messages:
            messages.append({"role": msg.role, "content": msg.content})

        # 添加最新的用户消息
        messages.append({"role": "user", "content": text})

        # 调用 DeepSeek API 进行续写
        response = client.chat.completions.create(
            model="deepseek-chat",
            messages=messages,
            max_tokens=50,  # 限制续写长度
            temperature=0.7,
            stream=False
        )

        completion = response.choices[0].message.content if response.choices else ""
        
        return jsonify({"completion": completion})

    except Exception as e:
        logger.error(f"Error in auto_complete: {str(e)}")
        return jsonify({"error": str(e)}), 500

# 提供静态资源
@app.route('/static/<path:filename>')
def serve_static(filename):
    return send_from_directory(app.static_folder, filename)

@app.route('/predict', methods=['POST'])
def predict():
    """
    预测接口
    ---
    parameters:
      - name: data
        in: body
        required: true
        schema:
          type: object
          properties:
            data:
              type: array
              items:
                type: number
    responses:
      200:
        description: 预测结果
        schema:
          type: object
          properties:
            result:
              type: number
    """
    data = request.json['data']
    # 这里添加您的模型推理逻辑
    result = sum(data)  # 示例逻辑
    return jsonify({'result': result})

if __name__ == '__main__':
    app.run(debug=True)