const AddenCheck = async (signal) => {
    const response = await fetch("/api/attendance/check", {
        method: "POST",
        credentials: "include",
        signal,
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || "체크를 저장할 수 없습니다.");
    if (data.isChecked !== true) throw new Error("체크 저장 결과를 확인할 수 없습니다.");
    return data;
}

export default AddenCheck;
