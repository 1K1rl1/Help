#!/usr/bin/env python3
import requests
import json

test_data = {
    "chat": {"id": "test_chat"},
    "text": "Название процесса: Приемка\nЛогин оператора склада: user1231\nИдентификатор объекта нарушения: ii12332233412\nКомментарий: Положил не в ту тару\nФИО кто выставил: Охотников К.А",
    "message_id": "test_msg_final"
}

try:
    response = requests.post(
        "http://localhost:5000/incoming",
        json=test_data,
        timeout=10
    )
    print(f"Status: {response.status_code}")
    print(f"Response: {response.json()}")
except Exception as e:
    print(f"Error: {e}")
