import os
import json

# 定义文件夹和文件路径
mp3_folder = 'mp3s'
json_file = 'song-list.json'

# 获取mp3s文件夹下所有的mp3文件
try:
    all_files = os.listdir(mp3_folder)
    # 直接使用文件名列表，并按名称排序
    mp3_files = sorted([f for f in all_files if f.lower().endswith('.mp3')])
except FileNotFoundError:
    print(f"错误：找不到 '{mp3_folder}' 文件夹。")
    exit()

# 写入song-list.json文件
try:
    with open(json_file, 'w', encoding='utf-8') as f:
        # 将文件名列表直接转储为JSON数组
        json.dump(mp3_files, f, indent=4, ensure_ascii=False)
    print(f"'{json_file}' 已成功更新为新的格式。")
except IOError as e:
    print(f"写入文件时出错: {e}")