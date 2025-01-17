# flask_deepseek

## 项目简介

`flask_deepseek` 是一个基于 Flask 框架的深度学习模型服务平台，旨在为用户提供简单易用的接口，以便快速部署和管理深度学习模型。该项目支持多种模型格式，并提供了灵活的 API 供用户调用。

## 特性

- **简单易用**：通过 RESTful API 轻松访问模型。
- **多模型支持**：支持 TensorFlow、PyTorch 等多种深度学习框架。
- **高性能**：优化的模型加载和推理速度。
- **可扩展性**：支持自定义模型和扩展功能。

## 安装

```bash
git clone https://github.com/hllqkb/flask_deepseek.git
cd flask_deepseek
pip install -r requirements.txt
```


```python

## 使用
python app.py
```

## 示例

以下是如何使用 API 的示例：

```bash
curl -X POST http://localhost:5000/predict -H "Content-Type: application/json" -d '{"data": [1, 2, 3]}'
```

## 贡献

欢迎任何形式的贡献！请查看 [贡献指南](CONTRIBUTING.md) 以获取更多信息。

## 许可证

该项目采用 MIT 许可证，详细信息请查看 [LICENSE](LICENSE) 文件。

## 联系

如有问题，请联系 [hllqkb@gmail.com](mailto:hllqkb@gmail.com)。

## API 文档

API 文档可以通过访问以下链接查看：

[http://localhost:5000/apidocs](http://localhost:5000/apidocs)
