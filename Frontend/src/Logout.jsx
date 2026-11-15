const Logout = (nav,{setMainId, setMainName, setMainRole, setRn, setStat, setIsChecked})=>{
    setMainId("")
    setMainName("")
    setMainRole("")
    setRn("")
    setStat("")
    setIsChecked(false)
    nav("/", {replace : true})
}

export default Logout;
