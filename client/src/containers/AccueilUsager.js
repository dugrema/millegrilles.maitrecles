import React, {useState, useEffect, useCallback} from 'react'
import {Row, Col, Button, Alert} from 'react-bootstrap'

import {ModalAjouterWebauthn} from './WebauthnAjouter'

export default function AccueilUsager(props) {

  return (
    <>
      <AlertAjouterAuthentification workers={props.workers}
                                    rootProps={props.rootProps} />

      <p>Accueil usager {props.rootProps.nomUsager}</p>
      <Button onClick={props.rootProps.deconnecter}>Deconnecter</Button>
    </>
  )
}

function AlertAjouterAuthentification(props) {
  /* Verifie si l'usager doit ajouter une methode d'authentification. */

  const [infoUsager, setInfoUsager] = useState('')
  const [show, setShow] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const hide = useCallback(_=>{setShow(false)}, [])
  const doHideModal = useCallback(_=>{setShowModal(false)}, [])
  const doShowModal = useCallback(_=>{setShowModal(true)}, [])

  useEffect( _ => {
    const {connexion} = props.workers
    connexion.getInfoUsager(props.rootProps.nomUsager)
      .then(infoUsager=>{
        console.debug("AlertAjouterAuthentification infoUsager : %O", infoUsager)
        setInfoUsager(infoUsager)
        const webauthn = infoUsager.webauthn || {}
        if(Object.keys(webauthn).length === 0) setShow(true)
      })
  }, [])

  return (
    <>
      <ModalAjouterWebauthn show={showModal}
                            hide={_=>{doHideModal()}}
                            workers={props.workers}
                            rootProps={props.rootProps} />

      <Alert variant="warning" show={show} onClose={hide} dismissible>
        <Alert.Heading>Ajouter methode de verification</Alert.Heading>
        <p>
          Votre compte n'a pas de methode d'authentification pour cet appareil.
          Veuillez en ajouter une en cliquant sur le bouton <i>Ajouter</i>.
        </p>
        <p>
          Sans methode d'authentification, votre pourriez perdre acces a votre
          compte.
        </p>
        <Button onClick={doShowModal}>Ajouter</Button>
      </Alert>
    </>
  )

}
