


const CheckLoginEmpty = ({Id,Password})=>{
    if (!Id.trim()){
        alert("아이디를 입력해주세요!")
        return false;
    }
    if(!Password){
        alert("비밀번호를 입력해주세요!")
        return false;
    }
    return true;
}

export default CheckLoginEmpty;
