


const CheckLoginEmpty = ({Id,Password})=>{
        if (!Id.trim()){

        alert("아이디를 입력해주세요!")
        return false;
    }else if(!Password){
        alert("비밀번호를 입력해주세요!")

    }else{
        console.log(Id, Password);


        return false;

    }
    return true;
}

export default CheckLoginEmpty;
