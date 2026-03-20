import os
import json

# 定义文件夹和文件路径
mp3_folder = 'mp3s'
json_file = 'song-list.js'

# 获取mp3s文件夹下所有的mp3文件
try:
    all_files = os.listdir(mp3_folder)
    mp3_files = sorted([f for f in all_files if f.lower().endswith('.mp3')])
except FileNotFoundError:
    print(f"错误：找不到 '{mp3_folder}' 文件夹。")
    exit()

# 写入song-list.js文件
try:
    with open(json_file, 'w', encoding='utf-8') as f:
        f.write('window.songList = ')
        json.dump(mp3_files, f, indent=4, ensure_ascii=False)
        f.write(';')
    print(f"'{json_file}' 已成功更新为新的格式。")

except IOError as e:
    print(f"写入文件时出错: {e}")