from parse_messenger_errors import parse_message, build_table_row
text = "Название процесса: Приемка\nЛогин оператора склада: user123\nИдентификатор объекта нарушения: OBJ_991, ii123\nМесто операции: Склад B\nКомментарий: Принят не в ту тару\nФИО кто выставил: Охотников К."
values = parse_message(text)
print(values)
print(build_table_row(values))
