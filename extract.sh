devicefilepath=$(adb shell pm path com.example.yuuonline)
devicefilepath=${devicefilepath#package:}  

adb pull "$devicefilepath"

apktool d base.apk

cp -r "base/assets" ./assets