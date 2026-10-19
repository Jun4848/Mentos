
const CheckEmpty = ({Id,Password})=>{
    if (!Id){ 
        alert("아이디를 입력해주세요!")
    }else if(!Password){
        alert("비밀번호를 입력해주세요!")
    }else{
        console.log("Id : "+ Id )
        console.log("Password : "+ Password )
    }
}

export default CheckEmpty;