import { useNavigate } from "react-router-dom";
import MainPageNav from "./MainPageNav";
import { useState } from "react";
import AddenCheck from "./AddenCheck";

const MainPage = ({day, Id, Name, Rn, Stat, setMainId, setMainName, setMainRole, setRn, setStat}) => {

    const nav = useNavigate()
    const [Status,setStatus] = useState("start") // start = 제출해야됨 | end = 제출기간 마감
    const [Acheck,setAcheck] = useState(false); // 출석체크 안되어있으면 false 되면 true
    const [Wcheck,setWcheck] = useState(false); // 와이파이 안되면 false 되면 true
    return(
        <div>
            <div>
                <MainPageNav setMainId={setMainId} setMainName={setMainName} setMainRole={setMainRole} setRn={setRn} setStat={setStat}/>
                <div className="flex flex-col  items-center w-screen h-[90vh] gap-5 bg-[#F5F8F5] p-8">
                    <div className="w-full h-[5vh]">
                        <h1 className="font-bold text-2xl">
                            {Name}, {Rn}호
                        </h1>
                    </div>
                    <div className="flex flex-col items-center w-full h-100 bg-white rounded-2xl shadow-xs p-5">
                        <div className="flex flex-col justify-between w-full">
                            <div className="w-60 h-25 p-5">
                                <h1 className="font-bold">
                                    현재 상태
                                </h1>
                                <h1 className="font-bold text-3xl">
                                    {Stat}
                                </h1>
                            </div>
                            <div className="flex flex-col w-full bg-[#F7F0E4] rounded-2xl border-2 border-[#E6D9C4] p-5 shadow-xs">
                                <h1 className="font-bold">
                                    와이파이
                                </h1>
                                <h1 className="font-bold text-[#A36259] text-3xl">
                                    연결 안됨
                                </h1>
                                <p className="font-bold text-[#80684C] text-[15px]">
                                    학교 와이파이로 연결해주세요
                                </p>
                            </div>
                        </div>
                        <div className="flex flex-col justify-center gap-2 w-full h-30">
                            
                            {!Acheck ? 
                                Wcheck ?  
                                <button className="bg-[#5F7C69] hover:bg-[#526D5C] text-white font-bold h-11 rounded-[20px] cursor-pointer transition"
                                onClick={()=>{AddenCheck({setAcheck})}}>
                                    출석체크
                                </button> : <button disabled className="bg-[#DCE8DF] text-[#52695B] font-bold border-2 border-[#A7BEAF] h-11 rounded-[20px]">
                                    출석체크 불가
                                </button> : 
                                <button className="bg-white text-[#5F7C69] border-2 border-[#A7BEAF] font-bold h-11 rounded-[20px]">
                                    출석완료
                                </button>
                            }
                            <p className="font-bold text-gray-400 text-[15px]">
                                {!Acheck ? "아직 출석체크를 하지 않았습니다!" : "출석체크를 완료하였습니다!"}
                            </p>
                        </div> 
                    </div>
                </div>
            </div>
        </div>
    )
};

export default MainPage;
