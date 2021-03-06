import React from 'react'
import { Nav, Navbar } from 'react-bootstrap';
import { Trans } from 'react-i18next';

export default function Menu(props) {

  var sousMenuApplication = props.sousMenuApplication
  if( ! sousMenuApplication ) {
    sousMenuApplication = (
      <MenuItems changerPage={props.changerPage} rootProps={props.rootProps}/>
    )
  }

  var renderCleMillegrille = ''
  if(props.rootProps.cleMillegrillePresente) {
    renderCleMillegrille = (
      <Nav className="justify-content-end">
        <Nav.Link onClick={props.rootProps.setCleMillegrillePresente}>
          <span title="Cle de MilleGrille chargee">
            <i className="fa fa-key"/>
          </span>
        </Nav.Link>
      </Nav>
    )
  }

  return (
    <Navbar collapseOnSelect expand="md" bg="info" variant="dark" fixed="top">
      <Nav.Link className="navbar-brand" onClick={props.goHome}>
        <Trans>application.nom</Trans>
      </Nav.Link>
      <Navbar.Toggle aria-controls="responsive-navbar-menu" />
      <Navbar.Collapse id="responsive-navbar-menu">
        <Nav>
          <Nav.Link href='/'></Nav.Link>
        </Nav>

        {sousMenuApplication}

        {renderCleMillegrille}
        <Nav className="justify-content-end">
          <Nav.Link onClick={props.rootProps.changerLanguage}><Trans>menu.changerLangue</Trans></Nav.Link>
        </Nav>
      </Navbar.Collapse>
    </Navbar>
  )
}

function MenuItems(props) {
  return (
    <Nav className="mr-auto" activeKey={props.rootProps.page} onSelect={props.changerPage}>
    </Nav>
  )
}
